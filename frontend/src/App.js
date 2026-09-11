import React, { useState, useRef, useEffect, useMemo } from 'react';
import axios from 'axios';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { FileDown, Activity, Mic, Settings, Layers, BarChart2, Users, Square, UploadCloud, Trash2, AlertCircle, Edit3, XCircle, AlertTriangle } from 'lucide-react';

const API_URL = 'http://localhost:8000';
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const WHISPER_LANGUAGES = [
    "af", "am", "ar", "as", "az", "ba", "be", "bg", "bn", "bo", "br", "bs", "ca", "cs", "cy", "da", "de", "el", "en", "es", "et", "eu", "fa", "fi", "fo", "fr", "gl", "gu", "ha", "haw", "he", "hi", "hr", "ht", "hu", "hy", "id", "is", "it", "ja", "jw", "ka", "kk", "km", "kn", "ko", "la", "lb", "ln", "lo", "lt", "lv", "mg", "mi", "mk", "ml", "mn", "mr", "ms", "mt", "my", "ne", "nl", "nn", "no", "oc", "pa", "pl", "ps", "pt", "ro", "ru", "sa", "sd", "si", "sk", "sl", "sn", "so", "sq", "sr", "su", "sv", "sw", "ta", "te", "tg", "th", "tk", "tl", "tr", "tt", "uk", "ur", "uz", "vi", "yi", "yo", "zh"
];

const getLanguageName = (code) => {
    if (!code || code === 'auto') return 'Auto Detect';
    try {
        const englishName = new Intl.DisplayNames(['en'], { type: 'language' }).of(code);
        return englishName ? englishName.charAt(0).toUpperCase() + englishName.slice(1) : code.toUpperCase();
    } catch (e) {
        return code.toUpperCase();
    }
};

const AudioRecorder = ({ onRecordingComplete }) => {
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const mediaRecorderRef = useRef(null);
    const timerRef = useRef(null);
    const chunksRef = useRef([]);

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorderRef.current = new MediaRecorder(stream);
            chunksRef.current = [];

            mediaRecorderRef.current.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    chunksRef.current.push(event.data);
                }
            };

            mediaRecorderRef.current.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
                const file = new File([blob], "microphone_recording.webm", { type: 'audio/webm' });
                onRecordingComplete(file);
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorderRef.current.start();
            setIsRecording(true);
            
            setRecordingTime(0);
            timerRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);

        } catch (err) {
            console.error("Microphone access denied:", err);
            alert("Could not access microphone. Please check permissions.");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            clearInterval(timerRef.current);
        }
    };

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    return (
        <div style={{display: 'flex', alignItems: 'center', gap: '15px', background: '#111827', padding: '10px', borderRadius: '6px', border: '1px solid #4b5563', justifyContent: 'center'}}>
            {!isRecording ? (
                <button type="button" onClick={startRecording} style={{background: '#ef4444', border: 'none', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 0 10px rgba(239, 68, 68, 0.4)'}}>
                    <Mic color="#fff" size={20} />
                </button>
            ) : (
                <button type="button" onClick={stopRecording} style={{background: '#374151', border: '2px solid #ef4444', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', animation: 'pulse 1.5s infinite'}}>
                    <Square color="#ef4444" size={16} fill="#ef4444" />
                </button>
            )}
            
            <div style={{fontFamily: 'monospace', fontSize: '1.2rem', color: isRecording ? '#ef4444' : '#6b7280', width: '60px'}}>
                {formatTime(recordingTime)}
            </div>
            
            {isRecording && <span style={{fontSize: '0.8rem', color: '#ef4444', fontWeight: 'bold'}}>REC</span>}
        </div>
    );
};

const ConflictModal = ({ onConfirmMedium, onConfirmLow, onCancel }) => (
    <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fadeIn 0.2s ease-in'
    }}>
        <div style={{
            background: '#1f2937', padding: '30px', borderRadius: '12px', 
            border: '1px solid #4b5563', maxWidth: '500px', width: '90%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
        }}>
            <h3 style={{marginTop: 0, color: '#f59e0b', fontSize: '1.3rem', display: 'flex', alignItems: 'center', gap: '10px'}}>
                <AlertTriangle /> Feature Restriction
            </h3>
            <p style={{color: '#d1d5db', lineHeight: '1.6', fontSize: '1rem', marginBottom: '25px'}}>
                You have selected <strong>Low (Fast)</strong> accuracy preset, but enabled advanced modules 
                (Diarization or Emotion Recognition).
                <br/><br/>
                These features require sophisticated AI models that are disabled in Fast mode.
            </p>
            
            <div style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
                <button onClick={onConfirmMedium} style={{
                    padding: '12px', background: '#2563eb', color: '#fff', border: 'none', 
                    borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                }}>
                    <Settings size={18} /> Change Accuracy to Medium & Proceed
                </button>
                
                <button onClick={onConfirmLow} style={{
                    padding: '12px', background: 'transparent', color: '#9ca3af', border: '1px solid #4b5563', 
                    borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem'
                }}>
                    Proceed without Diarization and Emotion Recognition
                </button>
                
                <button onClick={onCancel} style={{
                    padding: '8px', background: 'transparent', color: '#ef4444', border: 'none', 
                    cursor: 'pointer', marginTop: '5px', fontSize: '0.9rem'
                }}>
                    Cancel
                </button>
            </div>
        </div>
    </div>
);

function App() {
  const [file, setFile] = useState(null);
  const [inputType, setInputType] = useState('upload'); 
  const [qualityPreset, setQualityPreset] = useState('low'); 
  const [audioLang, setAudioLang] = useState('auto');
  const [referenceText, setReferenceText] = useState('');
  
  const [useTranscription, setUseTranscription] = useState(true);
  const [useDiarization, setUseDiarization] = useState(false);
  const [useEmotion, setUseEmotion] = useState(false);
  
  const [taskId, setTaskId] = useState(null);
  const [status, setStatus] = useState('IDLE');
  const [progress, setProgress] = useState(0); 
  const [statusMessage, setStatusMessage] = useState('');
  const [resultData, setResultData] = useState(null);
  const [error, setError] = useState(null);
  const [speakerMapping, setSpeakerMapping] = useState({});
  const [showConflictModal, setShowConflictModal] = useState(false); 
  
  const pollingIntervalRef = useRef(null);
  const resultsRef = useRef(null);

  const languageOptions = useMemo(() => {
      const options = WHISPER_LANGUAGES.map(code => ({
          code,
          label: getLanguageName(code)
      }));
      options.sort((a, b) => a.label.localeCompare(b.label, 'en'));
      return [
          { code: 'auto', label: 'Auto Detect' },
          ...options
      ];
  }, []);

  const sectionTitleStyle = {
    fontSize: '1.1rem',
    fontWeight: '600',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '15px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    borderBottom: '1px solid #374151',
    paddingBottom: '10px'
  };

  const handleFileChange = (e) => {
      if (e.target.files && e.target.files[0]) {
          setFile(e.target.files[0]);
          setError(null);
      }
  };
  
  const handleRecordingComplete = (recordedFile) => {
      setFile(recordedFile);
      setError(null);
  };

  const clearFile = () => {
      setFile(null);
      setError(null);
      const fileInput = document.getElementById('file-upload');
      if (fileInput) fileInput.value = "";
  };

  const handleExportPDF = async () => {
      window.print();
  };

  const handleSpeakerNameChange = (originalName, newName) => {
      setSpeakerMapping(prev => ({ ...prev, [originalName]: newName }));
  };

  const getFormattedTranscription = (text) => {
      if (!text) return "";
      return text.replace(/\[(SPEAKER_\d+|UNKNOWN)\]/g, (match, id) => {
          const mappedName = speakerMapping[id];
          return mappedName ? `[${mappedName}]` : match;
      });
  };

  const getChartSpeakerLabel = (originalName) => {
      return speakerMapping[originalName] || originalName;
  };

  const executeSubmission = async (overrideParams = {}) => {
    if (!file) return;

    setError(null);
    setResultData(null);
    setSpeakerMapping({});
    
    const finalPreset = overrideParams.qualityPreset || qualityPreset;
    const finalDiarization = overrideParams.useDiarization !== undefined ? overrideParams.useDiarization : useDiarization;
    const finalEmotion = overrideParams.useEmotion !== undefined ? overrideParams.useEmotion : useEmotion;

    if (overrideParams.qualityPreset) setQualityPreset(overrideParams.qualityPreset);
    if (overrideParams.useDiarization !== undefined) setUseDiarization(overrideParams.useDiarization);
    if (overrideParams.useEmotion !== undefined) setUseEmotion(overrideParams.useEmotion);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('quality_preset', finalPreset);
    formData.append('language', audioLang);
    if (referenceText) formData.append('reference_text', referenceText);
    formData.append('transcription', useTranscription.toString());
    formData.append('diarization', finalDiarization.toString());
    formData.append('emotion', finalEmotion.toString());

    try {
      setStatus('UPLOADING');
      setProgress(0);
      setStatusMessage('Uploading audio data...');
      
      const response = await axios.post(`${API_URL}/api/upload`, formData, { 
          headers: { 'Content-Type': 'multipart/form-data' } 
      });
      
      const { task_id } = response.data;
      if (!task_id) throw new Error("No task_id returned from server");

      setTaskId(task_id);
      setStatus('PROCESSING');
      startPolling(task_id);

    } catch (err) {
      console.error("Upload error:", err);
      let errMsg = 'Connection Error';
      if (err.response) {
          if (err.response.data && err.response.data.detail) errMsg = typeof err.response.data.detail === 'string' ? err.response.data.detail : JSON.stringify(err.response.data.detail);
          else if (err.response.statusText) errMsg = `Server Error: ${err.response.status} ${err.response.statusText}`;
      } else if (err.message) errMsg = err.message;
      
      setError(errMsg);
      setStatus('ERROR');
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!file) return;

    if (qualityPreset === 'low' && (useDiarization || useEmotion)) {
        setShowConflictModal(true);
        return;
    }

    executeSubmission();
  };

  const handleCancel = async () => {
      if (!taskId) return;
      try {
          await axios.post(`${API_URL}/api/cancel/${taskId}`);
          setStatusMessage("Cancelling...");
      } catch (err) {
          console.error("Cancel failed", err);
      }
  };

  const startPolling = (taskId) => {
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    
    pollingIntervalRef.current = setInterval(async () => {
      try {
        const res = await axios.get(`${API_URL}/api/status/${taskId}`);
        const { status, progress, status_message, error: apiError } = res.data; 
        
        setProgress(progress);
        setStatusMessage(status_message); 
        
        if (status === 'COMPLETED') { 
            clearInterval(pollingIntervalRef.current); 
            getResults(taskId); 
        } else if (status === 'ERROR' || status === 'FAILED') { 
            clearInterval(pollingIntervalRef.current); 
            setStatus('ERROR'); 
            setError(apiError || status_message || "Processing failed on server"); 
        } else if (status === 'CANCELLED') {
            clearInterval(pollingIntervalRef.current);
            setStatus('IDLE');
            setTaskId(null);
            setStatusMessage("Cancelled");
        }
      } catch (err) { 
          clearInterval(pollingIntervalRef.current); 
          setStatus('ERROR');
          setError("Polling connection lost");
      }
    }, 1000); 
  };

  const getResults = async (taskId) => {
    try {
      const res = await axios.get(`${API_URL}/api/results/${taskId}`);
      setResultData(res.data);
      setProgress(100);
      setStatusMessage('Completed');
      setStatus('DONE');
    } catch (err) { 
        setStatus('ERROR');
        setError("Failed to fetch results");
    }
  };

  useEffect(() => {
      return () => {
          if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
      };
  }, []);

  const isResultView = status === 'DONE' && resultData;
  const isProcessing = status === 'PROCESSING' || status === 'UPLOADING';
  
  const appStyle = { minHeight: '100vh', background: '#111827', color: '#f3f4f6', fontFamily: "'Inter', sans-serif", paddingBottom: '50px' };
  const mainGridStyle = { display: 'grid', gridTemplateColumns: isResultView ? '350px 1fr' : 'minmax(300px, 800px)', gap: '30px', maxWidth: '1400px', margin: '0 auto', padding: '20px', justifyContent: 'center', transition: 'all 0.5s ease-in-out' };
  const cardStyle = { background: '#1f2937', padding: '25px', borderRadius: '12px', border: '1px solid #374151', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', height: 'fit-content' };
  const inputStyle = { width: '100%', padding: '10px', background: '#111827', color: '#fff', border: '1px solid #4b5563', borderRadius: '6px', fontSize: '0.95rem', marginTop: '5px' };
  const labelStyle = { display: 'block', marginBottom: '8px', fontSize: '0.8rem', color: '#9ca3af', textTransform: 'uppercase', fontWeight: '600' };
  const tabBtnStyle = (isActive) => ({
      flex: 1, padding: '10px', background: isActive ? '#3b82f6' : '#374151', color: isActive ? '#fff' : '#9ca3af', border: 'none', cursor: 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.2s'
  });

  return (
    <div className="App" style={appStyle}>
      {showConflictModal && (
          <ConflictModal 
              onConfirmMedium={() => {
                  setShowConflictModal(false);
                  executeSubmission({ qualityPreset: 'medium' });
              }}
              onConfirmLow={() => {
                  setShowConflictModal(false);
                  executeSubmission({ useDiarization: false, useEmotion: false });
              }}
              onCancel={() => setShowConflictModal(false)}
          />
      )}

      <div style={{textAlign: 'center', padding: '30px 20px 10px 20px'}} className="no-print">
        <h1 style={{fontSize: '2rem', margin: '0 0 5px 0', background: 'linear-gradient(90deg, #60a5fa, #c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'}}>ASR Analysis Platform</h1>
        <p style={{color: '#6b7280', margin: 0}}>Speech Processing System</p>
      </div>

      <div style={mainGridStyle} className="main-content">
        
        <div style={{...cardStyle, order: 1}} className="no-print">
            <h3 style={{marginTop: 0, borderBottom: '1px solid #374151', paddingBottom: '15px', marginBottom: '20px', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '10px'}}>
                <Settings size={20} /> Configuration
            </h3>
            
            <form onSubmit={handleSubmit}>
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px'}}>
                    <div>
                        <label style={labelStyle}>Accuracy Preset</label>
                        <select value={qualityPreset} onChange={(e) => setQualityPreset(e.target.value)} style={inputStyle} disabled={isProcessing}>
                            <option value="low">Low (Fast)</option>
                            <option value="medium">Medium</option>
                            <option value="high">High (Slow)</option>
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>Source Language</label>
                        <select value={audioLang} onChange={(e) => setAudioLang(e.target.value)} style={inputStyle} disabled={isProcessing}>
                            {languageOptions.map(lang => (
                                <option key={lang.code} value={lang.code}>
                                    {lang.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div style={{background: '#111827', padding: '15px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #374151'}}>
                    <label style={labelStyle}>Active Modules</label>
                    <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
                        <label style={{display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer'}}>
                            <input type="checkbox" checked={useTranscription} onChange={(e) => setUseTranscription(e.target.checked)} disabled={isProcessing} /> Transcription
                        </label>
                        <label style={{display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer'}}>
                            <input type="checkbox" checked={useDiarization} onChange={(e) => setUseDiarization(e.target.checked)} disabled={isProcessing} /> Diarization
                        </label>
                        <label style={{display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer'}}>
                            <input type="checkbox" checked={useEmotion} onChange={(e) => setUseEmotion(e.target.checked)} disabled={isProcessing} /> Emotion Recognition
                        </label>
                    </div>
                </div>

                <div style={{marginBottom: '20px'}}>
                    <label style={labelStyle}>Ground Truth (Optional)</label>
                    <textarea rows="3" value={referenceText} onChange={(e) => setReferenceText(e.target.value)} placeholder="Correct text for WER..." style={{...inputStyle, fontFamily: 'monospace'}} disabled={isProcessing} />
                </div>

                <div style={{marginBottom: '25px'}}>
                    <label style={labelStyle}>Audio Source</label>
                    <div style={{display: 'flex', borderRadius: '6px', overflow: 'hidden', marginBottom: '15px', border: '1px solid #4b5563'}}>
                        <button type="button" onClick={() => { setInputType('upload'); setFile(null); setError(null); }} style={tabBtnStyle(inputType === 'upload')} disabled={isProcessing}>
                            <UploadCloud size={16} /> Upload File
                        </button>
                        <button type="button" onClick={() => { setInputType('mic'); setFile(null); setError(null); }} style={tabBtnStyle(inputType === 'mic')} disabled={isProcessing}>
                            <Mic size={16} /> Microphone
                        </button>
                    </div>

                    <div style={{minHeight: '60px'}}>
                        {file ? (
                            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#064e3b', padding: '10px 15px', borderRadius: '6px', border: '1px solid #059669'}}>
                                <div style={{display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden'}}>
                                    <FileDown size={20} color="#34d399"/>
                                    <span style={{whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px', fontSize: '0.9rem'}}>
                                        {file.name}
                                    </span>
                                </div>
                                {!isProcessing && (
                                    <button type="button" onClick={clearFile} style={{background: 'transparent', border: 'none', cursor: 'pointer', color: '#fca5a5'}} title="Remove file">
                                        <Trash2 size={18} />
                                    </button>
                                )}
                            </div>
                        ) : (
                            inputType === 'upload' ? (
                                <input id="file-upload" type="file" accept="audio/*" onChange={handleFileChange} style={{...inputStyle, padding: '10px'}} disabled={isProcessing} />
                            ) : (
                                <AudioRecorder onRecordingComplete={handleRecordingComplete} />
                            )
                        )}
                    </div>
                </div>

                <div style={{display: 'flex', gap: '10px'}}>
                    {!isProcessing ? (
                        <button type="submit" disabled={!file} style={{width: '100%', padding: '12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px'}}>
                            <Mic /> Run Analysis
                        </button>
                    ) : (
                        <button type="button" onClick={handleCancel} style={{width: '100%', padding: '12px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px'}}>
                            <XCircle /> Stop Analysis
                        </button>
                    )}
                </div>
            </form>

            {error && (
                <div style={{marginTop: '20px', background: '#7f1d1d', color: '#fecaca', padding: '15px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid #b91c1c', fontSize: '0.9rem'}}>
                    <AlertCircle size={20} />
                    <span>{error}</span>
                </div>
            )}

            {isProcessing && (
                <div style={{marginTop: '20px'}}>
                    <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '5px', color: '#60a5fa'}}>
                        <span>{statusMessage}</span><span>{progress}%</span>
                    </div>
                    <div style={{width: '100%', height: '6px', background: '#374151', borderRadius: '3px', overflow: 'hidden'}}>
                        <div style={{width: `${progress}%`, height: '100%', background: '#3b82f6', transition: 'width 0.3s'}}></div>
                    </div>
                </div>
            )}
        </div>

        {isResultView && (
            <div style={{order: 2, animation: 'fadeIn 0.5s ease-in'}} ref={resultsRef} className="results-container">
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}} className="no-print">
                    <h2 style={{margin: 0, fontSize: '1.5rem'}}>Analysis Report</h2>
                    <button onClick={handleExportPDF} style={{background: '#059669', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', display: 'flex', gap: '8px', fontWeight: '600'}}>
                        <FileDown size={18} /> Print Report (PDF)
                    </button>
                </div>

                <div className="print-only" style={{display: 'none', marginBottom: '20px', borderBottom: '2px solid #000', paddingBottom: '10px'}}>
                    <h1 style={{fontSize: '24px', color: '#000', margin: 0}}>ASR Analysis Report</h1>
                    <p style={{fontSize: '12px', color: '#555', margin: '5px 0 0 0'}}>Generated on: {new Date().toLocaleString()}</p>
                </div>

                <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px', marginBottom: '20px'}} className="stats-grid">
                    <div style={cardStyle} className="report-card">
                        <div style={{color: '#9ca3af', fontSize: '0.7rem', textTransform: 'uppercase'}} className="card-label">Time</div>
                        <div style={{fontSize: '1.5rem', fontWeight: 'bold'}} className="card-value">{resultData.processing_time}s</div>
                    </div>
                    <div style={cardStyle} className="report-card">
                        <div style={{color: '#9ca3af', fontSize: '0.7rem', textTransform: 'uppercase'}} className="card-label">Detected Language</div>
                        <div style={{fontSize: '1.5rem', fontWeight: 'bold', color: '#8b5cf6'}} className="card-value accent">
                            {getLanguageName(resultData.detected_language || audioLang)}
                        </div>
                    </div>
                    <div style={cardStyle} className="report-card">
                        <div style={{color: '#9ca3af', fontSize: '0.7rem', textTransform: 'uppercase'}} className="card-label">WER Score</div>
                        <div style={{fontSize: '1.5rem', fontWeight: 'bold', color: resultData.wer_score < 0.1 ? '#10b981' : '#f59e0b'}} className="card-value">
                            {resultData.wer_score !== null ? (resultData.wer_score * 100).toFixed(1) + '%' : 'N/A'}
                        </div>
                    </div>
                </div>

                <div style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '20px', marginBottom: '20px'}} className="charts-container">
                    
                    {resultData.speaker_stats && (
                        <div style={{...cardStyle, flex: '1 1 300px', maxWidth: '500px', display: 'flex', flexDirection: 'column'}} className="report-card chart-card">
                            <h4 style={sectionTitleStyle} className="card-header"><Users size={18} /> Diarization</h4>
                            <div style={{height: '220px', flex: '0 0 auto'}}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie 
                                            data={resultData.speaker_stats.map(entry => ({
                                                ...entry,
                                                name: getChartSpeakerLabel(entry.name)
                                            }))} 
                                            cx="50%" cy="50%" innerRadius={50} outerRadius={80} 
                                            fill="#8884d8" dataKey="value" 
                                            label={({name, value}) => `${name} (${value}%)`}
                                        >
                                            {resultData.speaker_stats.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                        </Pie>
                                        <Tooltip contentStyle={{background:'#111827', border:'1px solid #374151'}} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            
                            <div style={{marginTop: '20px', borderTop: '1px solid #374151', paddingTop: '15px'}} className="no-print">
                                <h5 style={{fontSize: '0.9rem', color: '#9ca3af', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '5px'}}>
                                    <Edit3 size={14} /> Rename Speakers
                                </h5>
                                <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
                                    {resultData.speaker_stats.map((speaker, index) => (
                                        <div key={speaker.name} style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                                            <div style={{width: '12px', height: '12px', borderRadius: '50%', background: COLORS[index % COLORS.length]}}></div>
                                            <span style={{fontSize: '0.85rem', color: '#d1d5db', minWidth: '80px'}}>{speaker.name}:</span>
                                            <input 
                                                type="text" 
                                                placeholder="Enter Name..." 
                                                value={speakerMapping[speaker.name] || ''}
                                                onChange={(e) => handleSpeakerNameChange(speaker.name, e.target.value)}
                                                style={{
                                                    background: '#111827', 
                                                    border: '1px solid #4b5563', 
                                                    color: '#fff', 
                                                    padding: '4px 8px', 
                                                    borderRadius: '4px',
                                                    fontSize: '0.85rem',
                                                    flex: 1
                                                }}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {resultData.emotion_result && (
                        <div style={{...cardStyle, flex: '1 1 300px', maxWidth: '500px'}} className="report-card chart-card">
                            <h4 style={sectionTitleStyle} className="card-header"><BarChart2 size={18} /> Emotion Recognition</h4>
                            <div style={{height: '220px'}}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={resultData.emotion_result} layout="vertical" margin={{left: 10}}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                                        <XAxis type="number" domain={[0, 100]} hide />
                                        <YAxis dataKey="name" type="category" width={70} stroke="#9ca3af" fontSize={12} />
                                        <Tooltip contentStyle={{background:'#111827', border:'1px solid #374151'}} itemStyle={{color:'#fff'}} />
                                        <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={20} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}
                </div>

                {resultData.transcription && (
                    <div style={{...cardStyle, marginBottom: '20px'}} className="report-card transcription-card">
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '1px solid #374151', paddingBottom: '10px'}} className="card-header">
                            <h3 style={{...sectionTitleStyle, borderBottom: 'none', paddingBottom: 0, marginBottom: 0}}>
                                <Layers size={18} /> Transcription
                            </h3>
                        </div>
                        <div style={{
                            background: '#111827', 
                            padding: '15px', 
                            borderRadius: '6px', 
                            color: '#e5e7eb', 
                            lineHeight: '1.6', 
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word', 
                            overflowWrap: 'break-word',
                            maxWidth: '100%' 
                        }} className="transcription-text">
                            {getFormattedTranscription(resultData.transcription)}
                        </div>
                    </div>
                )}

            </div>
        )}
      </div>
      <style>{`
        .spin { animation: spin 1s linear infinite; } 
        @keyframes spin { 100% { transform: rotate(360deg); } } 
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } } 
        @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); } 70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); } 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); } }
        
        @media print {
            @page {
                size: A4;
                margin: 1cm;
            }
            body {
                background-color: #fff !important;
                color: #000 !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            .App {
                background: #fff !important;
                color: #000 !important;
                padding: 0 !important;
                min-height: auto !important;
            }
            .no-print {
                display: none !important;
            }
            .print-only {
                display: block !important;
            }
            .main-content {
                display: block !important;
                margin: 0 !important;
                padding: 0 !important;
                max-width: 100% !important;
            }
            .results-container {
                width: 100% !important;
            }
            
            .report-card {
                background: #fff !important;
                border: 1px solid #ccc !important;
                box-shadow: none !important;
                color: #000 !important;
                break-inside: avoid; 
                page-break-inside: avoid;
                margin-bottom: 20px !important;
                padding: 15px !important;
            }

            .transcription-card {
                break-inside: auto !important;
                page-break-inside: auto !important;
                display: block !important;
            }
            
            .card-label { color: #555 !important; }
            .card-value { color: #000 !important; }
            .transcription-text {
                background: #f9f9f9 !important;
                color: #000 !important;
                border: 1px solid #eee;
            }
            .card-header {
                border-bottom: 1px solid #ddd !important;
                color: #000 !important;
            }
            .card-header h3, .card-header h4 {
                color: #000 !important;
            }
            
            .charts-container {
                display: block !important;
                break-inside: avoid; 
                page-break-inside: avoid;
            }
            .chart-card {
                width: 100% !important;
                max-width: 100% !important;
                flex: none !important;
            }
        }
      `}</style>
    </div>
  );
}

export default App;