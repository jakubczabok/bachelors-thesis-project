## YOU NEED TO INSERT YOUR HF_TOKEN BELOW IN LINE 53

import time
import os
import sys
import types
import gc
import jiwer
import subprocess
import pandas as pd 
import numpy as np
import torch
import omegaconf

try:
    torch.serialization.add_safe_globals([
        omegaconf.listconfig.ListConfig, 
        omegaconf.dictconfig.DictConfig
    ])
except AttributeError:
    pass 

_original_torch_load = torch.load
def _patched_torch_load(*args, **kwargs):
    kwargs['weights_only'] = False
    return _original_torch_load(*args, **kwargs)
torch.load = _patched_torch_load

import transformers.utils.import_utils
import transformers.modeling_utils

def _no_op_check_safe(*args, **kwargs):
    return True

transformers.utils.import_utils.check_torch_load_is_safe = _no_op_check_safe
transformers.modeling_utils.check_torch_load_is_safe = _no_op_check_safe

dummy_torchcodec = types.ModuleType("torchcodec")
dummy_decoders = types.ModuleType("decoders")
class DummyAudioDecoder: pass
dummy_decoders.AudioDecoder = DummyAudioDecoder
dummy_torchcodec.decoders = dummy_decoders
sys.modules["torchcodec"] = dummy_torchcodec
transformers.utils.import_utils.is_torchcodec_available = lambda: False

import whisperx
from whisperx.diarize import DiarizationPipeline
from transformers import pipeline
from sqlalchemy.orm import Session
from database import SessionLocal
from models import AnalysisTask, TaskStatus

# HF_TOKEN = "<INSERT YOUR HF_TOKEN HERE>"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
COMPUTE_TYPE = "float16" if torch.cuda.is_available() else "int8" 
BATCH_SIZE = 16 

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RESULTS_DIR = os.path.abspath(os.path.join(BASE_DIR, "../results"))
os.makedirs(RESULTS_DIR, exist_ok=True)

class TaskCancelledException(Exception):
    pass

current_whisper_model = None         
current_model_arch = None
current_diarize_model = None
current_emotion_model = None        
current_emotion_model_name = None   
current_task_id = None

def check_if_cancelled(db: Session, task_id: str):
    task = db.query(AnalysisTask).filter(AnalysisTask.id == task_id).first()
    if task and task.status == TaskStatus.CANCELLED:
        raise TaskCancelledException("Task cancelled by user.")

def update_status(db: Session, task: AnalysisTask, percent: int, message: str = None):
    try:
        if task.status == TaskStatus.CANCELLED:
            raise TaskCancelledException("Task cancelled by user.")
            
        task.progress = percent
        if message:
            task.status_message = message
        db.commit()
        print(f"Task {task.id}: {percent}% | {message if message else ''}")
    except TaskCancelledException:
        raise
    except Exception as e:
        print(f"Status update failed: {e}")

def ensure_wav_format(input_path):
    output_path = input_path.rsplit('.', 1)[0] + ".converted.wav"
    try:
        command = ["ffmpeg", "-i", input_path, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", "-y", output_path]
        subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        return output_path
    except subprocess.CalledProcessError as e:
        print(f"FFmpeg error: {e.stderr.decode('utf-8')[:200]}")
        raise ValueError("Audio conversion failed.")

def get_models_by_preset(preset: str):
    mapping = {
        "low": {"whisper": "tiny", "emotion": "base"},
        "medium": {"whisper": "base", "emotion": "base"},
        "high": {"whisper": "medium", "emotion": "large"} 
    }
    return mapping.get(preset, mapping["low"])

def load_whisperx_model(model_arch: str):
    global current_whisper_model, current_model_arch
    unload_emotion_model()
    if current_whisper_model is not None and current_model_arch == model_arch:
        return current_whisper_model
    print(f"Loading WhisperX model: {model_arch} on {DEVICE}...")
    if current_whisper_model is not None:
        del current_whisper_model
        gc.collect()
        torch.cuda.empty_cache()
    current_whisper_model = whisperx.load_model(model_arch, DEVICE, compute_type=COMPUTE_TYPE)
    current_model_arch = model_arch
    return current_whisper_model

def load_diarization_model():
    global current_diarize_model
    if current_diarize_model is not None:
        return current_diarize_model
    print("Loading Pyannote Diarization Pipeline...")
    current_diarize_model = DiarizationPipeline(use_auth_token=HF_TOKEN, device=DEVICE)
    return current_diarize_model

def unload_whisper():
    global current_whisper_model, current_diarize_model
    if current_whisper_model is not None:
        del current_whisper_model
        current_whisper_model = None
    if current_diarize_model is not None:
        del current_diarize_model
        current_diarize_model = None
    gc.collect()
    torch.cuda.empty_cache()

def unload_emotion_model():
    global current_emotion_model
    if current_emotion_model is not None:
        del current_emotion_model
        current_emotion_model = None
        gc.collect()
        torch.cuda.empty_cache()

def load_emotion_model_dynamic(size_choice: str):
    global current_emotion_model, current_emotion_model_name
    target_hf_repo = "superb/wav2vec2-base-superb-er" if size_choice == "base" else "ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition"
    if current_emotion_model is not None and current_emotion_model_name == size_choice:
        return current_emotion_model, target_hf_repo
    print(f"Loading Emotion Model: {target_hf_repo}...")
    unload_whisper()
    current_emotion_model = pipeline("audio-classification", model=target_hf_repo)
    current_emotion_model_name = size_choice
    return current_emotion_model, target_hf_repo

def perform_emotion_analysis(audio_path, model_size_name, db, task):
    temp_wav_path = None
    try:
        temp_wav_path = ensure_wav_format(audio_path)
        print(" -> Loading audio for emotion analysis (chunking mode)...")
        audio_array = whisperx.load_audio(temp_wav_path)
        
        check_if_cancelled(db, task.id)
        classifier, repo_name = load_emotion_model_dynamic(model_size_name)
        
        SAMPLE_RATE = 16000
        CHUNK_DURATION = 30
        CHUNK_SAMPLES = SAMPLE_RATE * CHUNK_DURATION
        total_samples = len(audio_array)
        
        aggregated_scores = {}
        num_chunks = int(np.ceil(total_samples / CHUNK_SAMPLES))
        print(f" -> Processing {num_chunks} chunks for emotion analysis...")
        
        for i in range(num_chunks):
            if i % 5 == 0: check_if_cancelled(db, task.id)
            
            start = i * CHUNK_SAMPLES
            end = min((i + 1) * CHUNK_SAMPLES, total_samples)
            chunk = audio_array[start:end]
            
            if len(chunk) < 16000: continue
            
            preds = classifier(chunk, top_k=5)
            
            for p in preds:
                label = p['label'].lower().strip()
                score = p['score']
                if label not in aggregated_scores: aggregated_scores[label] = []
                aggregated_scores[label].append(score)
        
        final_results = []
        label_map = {
            "neu": "Neutral", "hap": "Happy", "ang": "Angry", "sad": "Sad",
            "exc": "Excited", "fea": "Fear", "sur": "Surprise", "dis": "Disgust",
            "neutral": "Neutral", "happy": "Happy", "angry": "Angry", 
            "sadness": "Sad", "sad": "Sad", "fear": "Fear", "fearful": "Fear",
            "surprise": "Surprise", "surprised": "Surprise",
            "disgust": "Disgust", "disgusted": "Disgust", "calm": "Calm"
        }
        
        for raw_label, scores in aggregated_scores.items():
            avg_score = sum(scores) / len(scores)
            final_label = label_map.get(raw_label, raw_label.capitalize())
            
            existing = next((item for item in final_results if item["name"] == final_label), None)
            if existing:
                existing["value"] += avg_score
            else:
                final_results.append({"name": final_label, "value": avg_score})
        
        total_sum = sum(item["value"] for item in final_results)
        if total_sum > 0:
            for item in final_results:
                item["value"] = round((item["value"] / total_sum) * 100, 1)
        
        final_results.sort(key=lambda x: x['value'], reverse=True)
        return final_results[:6]

    except TaskCancelledException:
        raise
    except Exception as e:
        print(f"Emotion Analysis Failed: {e}")
        import traceback
        traceback.print_exc()
        return None
    finally:
        if temp_wav_path and os.path.exists(temp_wav_path) and temp_wav_path != audio_path:
            os.remove(temp_wav_path)

def calculate_wer(reference: str, hypothesis: str) -> float:
    if not reference: return None
    t = jiwer.Compose([jiwer.ToLowerCase(), jiwer.RemovePunctuation(), jiwer.RemoveMultipleSpaces(), jiwer.Strip()])
    try:
        return round(jiwer.wer(t(reference), t(hypothesis)), 4)
    except: return None

def assign_speakers_fallback(whisper_segments, diarization_df):
    diarized_text = ""
    speaker_durations = {}
    for seg in whisper_segments:
        start = seg['start']
        end = seg['end']
        text = seg['text'].strip()
        best_speaker = "UNKNOWN"
        max_overlap = 0
        for _, row in diarization_df.iterrows():
            d_start, d_end, spk = row['start'], row['end'], row['speaker']
            overlap = max(0, min(end, d_end) - max(start, d_start))
            if overlap > max_overlap:
                max_overlap = overlap
                best_speaker = spk
        duration = end - start
        speaker_durations[best_speaker] = speaker_durations.get(best_speaker, 0) + duration
        diarized_text += f"[{best_speaker}] {text}\n"
    total_dur = sum(speaker_durations.values())
    stats = []
    if total_dur > 0:
        for spk, dur in speaker_durations.items():
            stats.append({"name": spk, "value": round((dur/total_dur)*100, 2)})
    return diarized_text, stats

def process_whisperx_pipeline(db, task, config):
    update_status(db, task, 10, "Preprocessing Audio...")
    audio = whisperx.load_audio(task.local_audio_path)
    
    check_if_cancelled(db, task.id)
    update_status(db, task, 20, "Transcribing...")
    model = load_whisperx_model(config['whisper'])
    
    lang_arg = None
    if task.language and task.language != "auto":
        lang_arg = task.language.split('-')[0].lower()

    result = model.transcribe(audio, batch_size=BATCH_SIZE, language=lang_arg)
    task.detected_language = result["language"]
    
    full_text = " ".join([seg['text'] for seg in result['segments']]).strip()
    task.transcription_text = full_text
    
    with open(os.path.join(RESULTS_DIR, f"{task.id}.txt"), 'w', encoding='utf-8') as f:
        f.write(full_text)
    task.local_result_path = os.path.join(RESULTS_DIR, f"{task.id}.txt")

    check_if_cancelled(db, task.id)
    
    alignment_succeeded = False
    try:
        update_status(db, task, 50, "Aligning text with audio...")
        model_a, metadata = whisperx.load_align_model(language_code=result["language"], device=DEVICE)
        result = whisperx.align(result["segments"], model_a, metadata, audio, DEVICE, return_char_alignments=False)
        alignment_succeeded = True
        del model_a
        gc.collect()
        torch.cuda.empty_cache()
    except Exception as e:
        print(f"WARNING: Alignment failed ({e}). Proceeding with coarse diarization.")

    if task.diarization_enabled:
        check_if_cancelled(db, task.id)
        update_status(db, task, 70, "Performing Speaker Diarization...")
        diarize_model = load_diarization_model()
        diarize_segments = diarize_model(audio) 
        
        if alignment_succeeded:
            result = whisperx.assign_word_speakers(diarize_segments, result)
            speaker_durations = {}
            for seg in result["segments"]:
                if "speaker" in seg:
                    spk = seg["speaker"]
                    dur = seg["end"] - seg["start"]
                    speaker_durations[spk] = speaker_durations.get(spk, 0.0) + dur
            total_dur = sum(speaker_durations.values())
            stats = []
            if total_dur > 0:
                for spk, dur in speaker_durations.items():
                    stats.append({"name": spk, "value": round((dur/total_dur)*100, 2)})
            diarized_text = ""
            for seg in result["segments"]:
                spk = seg.get("speaker", "UNKNOWN")
                text = seg["text"].strip()
                diarized_text += f"[{spk}] {text}\n"
            task.transcription_text = diarized_text
            task.speaker_stats = stats
        else:
            print("Running fallback speaker assignment...")
            diarized_text, stats = assign_speakers_fallback(result["segments"], diarize_segments)
            task.transcription_text = diarized_text
            task.speaker_stats = stats
        
        with open(task.local_result_path, 'w', encoding='utf-8') as f:
            f.write(task.transcription_text)

def process_next_task(db: Session):
    global current_task_id
    task = db.query(AnalysisTask).filter(AnalysisTask.status == TaskStatus.NEW).first()
    if not task: return False

    current_task_id = task.id
    
    if task.quality_preset == "low":
        task.diarization_enabled = False
        task.emotion_enabled = False
        print(f"Task {task.id}: Low preset enforced - disabling diarization and emotion modules.")

    config = get_models_by_preset(task.quality_preset)
    print(f"Processing: {task.id} | Device: {DEVICE} | Preset: {task.quality_preset}")
    
    if task.status == TaskStatus.CANCELLED:
        return True

    task.status = TaskStatus.PROCESSING
    update_status(db, task, 5, "Initializing...")
    start_time = time.time()
    
    try:
        check_if_cancelled(db, task.id)
        
        if task.transcription_enabled:
            process_whisperx_pipeline(db, task, config)
        
        if task.emotion_enabled:
            update_status(db, task, 85, "Emotion Recognition...")
            task.emotion_result = perform_emotion_analysis(task.local_audio_path, config['emotion'], db, task)
        
        check_if_cancelled(db, task.id)
        
        update_status(db, task, 95, "Finalizing...")
        end_time = time.time()
        task.processing_time = round(end_time - start_time, 2)
        
        if task.reference_text:
            task.wer_score = calculate_wer(task.reference_text, task.transcription_text)
        
        task.status = TaskStatus.COMPLETED
        update_status(db, task, 100, "Completed")
        print(f"Task finished. Time: {task.processing_time}s")

    except TaskCancelledException:
        print(f"Task {task.id} cancelled by user.")
        task.status = TaskStatus.CANCELLED
        task.status_message = "Cancelled"
        db.commit()
        
    except Exception as e:
        print(f"Error processing task {task.id}: {e}")
        import traceback
        traceback.print_exc()
        task.status = TaskStatus.ERROR
        update_status(db, task, 0, f"Error: {str(e)}")
        db.commit()
    
    finally:
        current_task_id = None
        gc.collect()
        torch.cuda.empty_cache()

    return True

def main_loop():
    print(f"AI Worker started. DEVICE={DEVICE}, COMPUTE={COMPUTE_TYPE}")
    while True:
        db = SessionLocal()
        try:
            while process_next_task(db): pass
        except Exception as e:
            print(f"Critical Worker Loop Error: {e}")
        finally:
            db.close()
        time.sleep(1)

if __name__ == "__main__":
    main_loop()
