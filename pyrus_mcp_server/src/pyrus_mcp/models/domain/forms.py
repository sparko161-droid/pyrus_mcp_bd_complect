from typing import Any, List, Optional
from .common import PyrusBaseModel

class FormField(PyrusBaseModel):
    id: int
    type: str
    name: str
    info: Optional[Any] = None
    value: Optional[Any] = None
    
class FormTemplate(PyrusBaseModel):
    id: int
    name: str
    steps: Optional[dict] = None
    fields: List[FormField] = []
