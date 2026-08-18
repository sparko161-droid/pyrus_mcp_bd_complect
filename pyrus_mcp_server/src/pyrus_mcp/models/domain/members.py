from typing import Optional, List
from .common import PyrusBaseModel

class Department(PyrusBaseModel):
    department_id: int
    department_name: str
    manager_id: Optional[int] = None

class Person(PyrusBaseModel):
    id: int
    first_name: str
    last_name: str
    email: Optional[str] = None
    department_id: Optional[int] = None
    department_name: Optional[str] = None
    type: str = "person" # e.g. "person", "bot", "role"

class Role(PyrusBaseModel):
    id: int
    name: str
    member_ids: Optional[List[int]] = None
