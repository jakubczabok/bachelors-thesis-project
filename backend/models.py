from sqlalchemy import Column, String, DateTime, Float, Text, Integer, Boolean, JSON, Enum as SQLEnum
from database import Base
import enum
import uuid
from datetime import datetime

class TaskStatus(str, enum.Enum):
    NEW = "NEW"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    ERROR = "ERROR"
    CANCELLED = "CANCELLED" 

class AnalysisTask(Base):
    __tablename__ = "analysis_tasks"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    status = Column(SQLEnum(TaskStatus), default=TaskStatus.NEW, nullable=False)
    
    original_filename = Column(String, nullable=True)
    local_audio_path = Column(String, nullable=False)
    local_result_path = Column(String, nullable=True)
    
    quality_preset = Column(String, default="low") 
    language = Column(String, default="auto")    
    reference_text = Column(Text, nullable=True)
    
    transcription_enabled = Column(Boolean, default=True)
    diarization_enabled = Column(Boolean, default=False)
    emotion_enabled = Column(Boolean, default=False)
    
    transcription_text = Column(Text, nullable=True) 
    detected_language = Column(String, nullable=True)
    
    speaker_stats = Column(JSON, nullable=True)
    emotion_result = Column(JSON, nullable=True)
    
    wer_score = Column(Float, nullable=True)
    processing_time = Column(Float, nullable=True)
    
    progress = Column(Integer, default=0)
    status_message = Column(String, default="Queued")
    
    created_at = Column(DateTime, default=datetime.utcnow)