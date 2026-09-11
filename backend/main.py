import os
import uuid
import aiofiles
from datetime import datetime
from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

import models
from database import engine, get_db
from models import AnalysisTask, TaskStatus

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOADS_DIR = os.path.abspath(os.path.join(BASE_DIR, "../uploads"))
RESULTS_DIR = os.path.abspath(os.path.join(BASE_DIR, "../results"))

os.makedirs(UPLOADS_DIR, exist_ok=True)
os.makedirs(RESULTS_DIR, exist_ok=True)

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Speech Analysis API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/upload")
async def upload_audio_file(
    file: UploadFile = File(...),
    quality_preset: str = Form("low"),   
    language: str = Form("auto"),         
    reference_text: str = Form(None),
    transcription: bool = Form(True),
    diarization: bool = Form(False),
    emotion: bool = Form(False),
    db: Session = Depends(get_db)
):
    task_uuid = str(uuid.uuid4())
    file_extension = os.path.splitext(file.filename)[1]
    local_audio_path = os.path.join(UPLOADS_DIR, f"{task_uuid}{file_extension}")

    try:
        async with aiofiles.open(local_audio_path, 'wb') as out_file:
            content = await file.read()
            await out_file.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File save error: {e}")

    new_task = AnalysisTask(
        id=task_uuid,
        original_filename=file.filename,
        local_audio_path=local_audio_path,
        status=TaskStatus.NEW,
        quality_preset=quality_preset,
        language=language,          
        reference_text=reference_text,
        transcription_enabled=transcription,
        diarization_enabled=diarization,
        emotion_enabled=emotion,
        progress=0,
        status_message="Queued"
    )
    db.add(new_task)
    db.commit()
    db.refresh(new_task)

    return {"task_id": task_uuid, "message": "Task queued"}

@app.post("/api/cancel/{task_id}")
def cancel_task(task_id: str, db: Session = Depends(get_db)):
    task = db.query(AnalysisTask).filter(AnalysisTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if task.status in [TaskStatus.NEW, TaskStatus.PROCESSING]:
        task.status = TaskStatus.CANCELLED
        task.status_message = "Cancelled by user"
        db.commit()
        return {"message": "Task cancellation requested"}
    
    return {"message": "Task already completed or failed"}

@app.get("/api/status/{task_id}")
def get_task_status(task_id: str, db: Session = Depends(get_db)):
    task = db.query(AnalysisTask).filter(AnalysisTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return {
        "task_id": task_id, 
        "status": task.status, 
        "progress": task.progress,
        "status_message": task.status_message,
        "error": task.status_message if task.status == TaskStatus.ERROR else None
    }

@app.get("/api/results/{task_id}")
def get_task_results(task_id: str, db: Session = Depends(get_db)):
    task = db.query(AnalysisTask).filter(AnalysisTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if task.status == TaskStatus.COMPLETED:
        transcription_content = ""
        if task.transcription_text:
            transcription_content = task.transcription_text
        elif task.transcription_enabled and task.local_result_path and os.path.exists(task.local_result_path):
             try:
                with open(task.local_result_path, 'r', encoding='utf-8') as f:
                    transcription_content = f.read()
             except: pass

        return {
            "task_id": task_id,
            "status": task.status,
            "transcription": transcription_content,
            "detected_language": task.detected_language, 
            "quality_preset": task.quality_preset,
            "wer_score": task.wer_score,        
            "processing_time": task.processing_time,
            "speaker_stats": task.speaker_stats,
            "emotion_result": task.emotion_result,
        }
    
    elif task.status == TaskStatus.ERROR:
        raise HTTPException(status_code=500, detail=task.status_message)
    elif task.status == TaskStatus.CANCELLED:
        raise HTTPException(status_code=400, detail="Task was cancelled")
    else:
        return {"task_id": task_id, "status": task.status}