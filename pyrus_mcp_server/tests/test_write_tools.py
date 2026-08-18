import pytest
import json
from unittest.mock import patch, AsyncMock
from pyrus_mcp.tools.tasks import create_task

@pytest.mark.asyncio
@patch("pyrus_mcp.tools.tasks.pyrus_client.post", new_callable=AsyncMock)
async def test_create_task_tool(mock_post):
    mock_post.return_value = {
        "task": {
            "id": 8888,
            "text": "New Task",
            "create_date": "2023-10-01T12:00:00Z",
            "last_modified_date": "2023-10-01T12:00:00Z",
            "author": {
                "id": 101,
                "first_name": "John",
                "last_name": "Doe"
            },
            "fields": [],
            "approvals": [],
            "comments": []
        }
    }
    
    result = await create_task({"text": "New Task", "form_id": 123})
    assert len(result) == 1
    
    parsed = json.loads(result[0].text)
    assert parsed["id"] == 8888
    
    mock_post.assert_called_once()
    args, kwargs = mock_post.call_args
    assert args[0] == "/tasks"
    assert kwargs["json"]["text"] == "New Task"
    assert kwargs["json"]["form_id"] == 123
