from typing import List, Optional, Any
from datetime import datetime
from pydantic import Field
from .common import PyrusBaseModel
from .members import Person
from .forms import FormField

class Approval(PyrusBaseModel):
    person: Person
    step: int
    approval_choice: str = "waiting"

class TaskComment(PyrusBaseModel):
    id: int
    text: Optional[str] = None
    create_date: datetime
    author: Person
    field_updates: Optional[List[FormField]] = None
    approval_choice: Optional[str] = None

class Task(PyrusBaseModel):
    id: int
    text: str
    create_date: datetime
    last_modified_date: datetime
    author: Person
    close_date: Optional[datetime] = None
    
    # Form specifics
    form_id: Optional[int] = None
    fields: List[FormField] = Field(default_factory=list)
    approvals: List[List[Approval]] = Field(default_factory=list)
    
    # Comments (usually returned inside the task response)
    comments: List[TaskComment] = Field(default_factory=list)
