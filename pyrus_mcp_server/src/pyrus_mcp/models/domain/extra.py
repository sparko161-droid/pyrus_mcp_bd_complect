from typing import Optional
from .common import PyrusBaseModel

class File(PyrusBaseModel):
    id: int
    name: str
    size: int
    md5: Optional[str] = None
    url: str

class Announcement(PyrusBaseModel):
    id: int
    text: str
    author_id: int
    # Additional announcement fields can be added here
