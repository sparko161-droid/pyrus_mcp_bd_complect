from typing import Optional, Generic, TypeVar, List
from pydantic import BaseModel, ConfigDict

T = TypeVar('T')

class PyrusBaseModel(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

class PyrusErrorResponse(PyrusBaseModel):
    error_code: Optional[str] = None
    error_msg: Optional[str] = None

class PyrusListResponse(PyrusBaseModel, Generic[T]):
    items: List[T]
    
    # In some endpoints Pyrus returns lists wrapped directly, but some might have pagination
    # This is a generic container to represent common list properties if any are added
