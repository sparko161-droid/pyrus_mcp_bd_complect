import pytest
import json
from unittest.mock import patch, AsyncMock
from pyrus_mcp.tools.tasks import get_task

@pytest.mark.asyncio
@patch("pyrus_mcp.tools.tasks.pyrus_client.get", new_callable=AsyncMock)
async def test_get_task_tool(mock_get):
    # Mocking the PyrusClient response matching our fixture
    mock_get.return_value = {
        "task": {
            "id": 1234567,
            "text": "Please review this document",
            "create_date": "2023-10-01T12:00:00Z",
            "last_modified_date": "2023-10-01T12:30:00Z",
            "author": {
                "id": 101,
                "first_name": "John",
                "last_name": "Doe",
                "email": "john.doe@example.com",
                "type": "person"
            },
            "form_id": 999,
            "fields": [
                {
                    "id": 1,
                    "type": "text",
                    "name": "Subject",
                    "value": "Review Request"
                }
            ],
            "approvals": [],
            "comments": []
        }
    }
    
    result = await get_task({"task_id": 1234567})
    assert len(result) == 1
    
    parsed = json.loads(result[0].text)
    assert parsed["id"] == 1234567
    assert parsed["text"] == "Please review this document"
    assert parsed["author"]["first_name"] == "John"
    
    mock_get.assert_called_once_with("/tasks/1234567")
