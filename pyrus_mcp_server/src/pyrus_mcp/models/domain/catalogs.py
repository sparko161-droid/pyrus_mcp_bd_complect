from typing import List, Optional, Any
from .common import PyrusBaseModel
from pydantic import Field

class CatalogHeader(PyrusBaseModel):
    catalog_id: int
    name: str
    version: int

class CatalogItem(PyrusBaseModel):
    item_id: int
    values: List[str]
    # Optionally: headers map

class Catalog(PyrusBaseModel):
    catalog_id: int
    name: str
    version: int
    catalog_headers: List[dict] = Field(default_factory=list)
    items: List[CatalogItem] = Field(default_factory=list)
