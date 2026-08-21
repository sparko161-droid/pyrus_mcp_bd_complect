from typing import Optional
from .common import PyrusBaseModel

class File(PyrusBaseModel):
    id: int
    name: str
    size: int
    md5: Optional[str] = None
    url: str

class Announcement(PyrusBaseModel):
    id: Optional[int] = None
    text: Optional[str] = None
    author_id: Optional[int] = None
    author: Optional[dict] = None
    create_date: Optional[str] = None
    comments: Optional[list] = None
    attachments: Optional[list] = None
