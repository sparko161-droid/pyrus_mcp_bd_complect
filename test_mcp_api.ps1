$ErrorActionPreference = 'Stop'

$login = "admin@standartmaster.ru"
$security_key = "AoTR6E2Zq2G35ZivN95wr8CV5gyABUYny98S50cknXo20alXtVaHow4L7NpxZhe-~iyrZbCPr5NFpXBD7OK5pGs6UHZbXeom"
$person_id = 1238106
$base_url = "https://api.pyrus.com/v4"

Write-Host "1. Authenticating..."
$auth_body = @{ login = $login; security_key = $security_key; person_id = $person_id } | ConvertTo-Json
$auth_res = Invoke-RestMethod -Uri "$base_url/auth" -Method Post -Body $auth_body -ContentType "application/json"
$token = $auth_res.access_token
$headers = @{ Authorization = "Bearer $token" }
Write-Host "Token obtained."

$report = @()

function Test-Endpoint {
    param($Name, $Method, $Uri, $Body = $null)
    Write-Host "Testing $Name..."
    try {
        if ($Method -eq 'Get') {
            $res = Invoke-RestMethod -Uri "$base_url$Uri" -Method Get -Headers $headers
        } else {
            $res = Invoke-RestMethod -Uri "$base_url$Uri" -Method Post -Body ($Body | ConvertTo-Json -Depth 10) -Headers $headers -ContentType "application/json"
        }
        $report += "SUCCESS: $Name"
        return $res
    } catch {
        $report += "ERROR: $Name - $_"
        Write-Host "Error in $Name : $_" -ForegroundColor Red
        return $null
    }
}

# 1. Forms
$forms = Test-Endpoint -Name "get_forms" -Method 'Get' -Uri "/forms"
$form_id = 2371445 # CRM
$form = Test-Endpoint -Name "get_form" -Method 'Get' -Uri "/forms/$form_id"

# 2. Registry
$registry = Test-Endpoint -Name "get_registry" -Method 'Get' -Uri "/forms/$form_id/register?item_count=1"

# 3. Catalogs
$catalogs = Test-Endpoint -Name "get_catalogs" -Method 'Get' -Uri "/catalogs"

# 4. Members
$members = Test-Endpoint -Name "get_members" -Method 'Get' -Uri "/members"

# 5. KB
$kb = Test-Endpoint -Name "get_kb_structure" -Method 'Get' -Uri "/knowledgebase/structure"

# 6. Create Task
$create_payload = @{
    form_id = $form_id
    fields = @(
        @{ id = 33; value = "Test task from MCP Audit" }
    )
}
$new_task = Test-Endpoint -Name "create_task" -Method 'Post' -Uri "/tasks" -Body $create_payload

if ($new_task -and $new_task.task) {
    $task_id = $new_task.task.id
    Write-Host "Created task: $task_id"
    
    # 7. Add comment
    $comment_payload = @{
        text = "Comment from MCP automated test"
        action = "finished"
    }
    $comment = Test-Endpoint -Name "add_comment" -Method 'Post' -Uri "/tasks/$task_id/comments" -Body $comment_payload
}

$report | Out-File "mcp_test_report.txt" -Encoding UTF8
Write-Host "Done!"
