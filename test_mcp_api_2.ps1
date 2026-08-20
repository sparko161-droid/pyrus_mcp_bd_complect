$ErrorActionPreference = 'Continue'

$login = "admin@standartmaster.ru"
$security_key = "AoTR6E2Zq2G35ZivN95wr8CV5gyABUYny98S50cknXo20alXtVaHow4L7NpxZhe-~iyrZbCPr5NFpXBD7OK5pGs6UHZbXeom"
$person_id = 1238106
$base_url = "https://api.pyrus.com/v4"

Write-Host "1. Authenticating..."
$auth_body = @{ login = $login; security_key = $security_key; person_id = $person_id } | ConvertTo-Json
$auth_res = Invoke-RestMethod -Uri "$base_url/auth" -Method Post -Body $auth_body -ContentType "application/json"
$token = $auth_res.access_token
$files_url = $auth_res.files_url
$headers = @{ Authorization = "Bearer $token" }
Write-Host "Token obtained."

$report = @()

function Test-Endpoint {
    param($Name, $Method, $Uri, $Body = $null, $Base = $base_url)
    Write-Host "Testing $Name..."
    try {
        if ($Method -eq 'Get') {
            $res = Invoke-RestMethod -Uri "$Base$Uri" -Method Get -Headers $headers
        } elseif ($Method -eq 'Delete') {
            $res = Invoke-RestMethod -Uri "$Base$Uri" -Method Delete -Headers $headers
        } elseif ($Method -eq 'Put') {
            $res = Invoke-RestMethod -Uri "$Base$Uri" -Method Put -Body ($Body | ConvertTo-Json -Depth 10) -Headers $headers -ContentType "application/json"
        } else {
            $res = Invoke-RestMethod -Uri "$Base$Uri" -Method Post -Body ($Body | ConvertTo-Json -Depth 10) -Headers $headers -ContentType "application/json"
        }
        $report += "SUCCESS: $Name"
        return $res
    } catch {
        $report += "ERROR: $Name"
        Write-Host "Error in $Name : $_" -ForegroundColor Red
        return $null
    }
}

# 1. get_task
$task = Test-Endpoint -Name "get_task" -Method 'Get' -Uri "/tasks/374275851"

# 2. get_catalog (Fetch catalogs first to get an ID)
$catalogs = Test-Endpoint -Name "get_catalogs_prep" -Method 'Get' -Uri "/catalogs"
if ($catalogs.catalogs.Count -gt 0) {
    $cat_id = $catalogs.catalogs[0].catalog_id
    $catalog = Test-Endpoint -Name "get_catalog" -Method 'Get' -Uri "/catalogs/$cat_id"
}

# 3. get_roles
$roles = Test-Endpoint -Name "get_roles" -Method 'Get' -Uri "/roles"

# 4. get_announcements
$announcements = Test-Endpoint -Name "get_announcements" -Method 'Get' -Uri "/announcements"

# 5. KB CRUD
$kb_create = @{ title = "Test KB from MCP"; content = "This is a test document." }
$kb_new = Test-Endpoint -Name "create_kb_object" -Method 'Post' -Uri "/knowledgebase" -Body $kb_create
if ($kb_new.knowledge_base_article) {
    $kb_id = $kb_new.knowledge_base_article.id
    
    Test-Endpoint -Name "get_kb_object" -Method 'Get' -Uri "/knowledgebase/$kb_id"
    Test-Endpoint -Name "update_kb_object" -Method 'Put' -Uri "/knowledgebase/$kb_id" -Body @{ title = "Updated KB" }
    Test-Endpoint -Name "get_kb_permissions" -Method 'Get' -Uri "/knowledgebase/$kb_id/permissions"
    Test-Endpoint -Name "delete_kb_object" -Method 'Delete' -Uri "/knowledgebase/$kb_id"
}

# 6. File Upload/Download
try {
    Write-Host "Testing upload_file..."
    $Boundary = [System.Guid]::NewGuid().ToString()
    $ContentType = "multipart/form-data; boundary=$Boundary"
    $FileContent = [System.Text.Encoding]::UTF8.GetBytes("Hello MCP")
    $Body = (
        "--$Boundary
",
        'Content-Disposition: form-data; name="file"; filename="test.txt"' + "
",
        'Content-Type: text/plain' + "

",
        [System.Text.Encoding]::UTF8.GetString($FileContent),
        "
--$Boundary--
"
    ) -join ""
    
    $res = Invoke-RestMethod -Uri "$files_url/files/upload" -Method Post -Body $Body -ContentType $ContentType -Headers $headers
    $guid = $res.guid
    $report += "SUCCESS: upload_file"
    
    Write-Host "Testing download_file..."
    $dl = Invoke-RestMethod -Uri "$files_url/files/download/$guid" -Method Get -Headers $headers
    $report += "SUCCESS: download_file"
} catch {
    $report += "ERROR: upload/download - $_"
    Write-Host "Error in files: $_" -ForegroundColor Red
}

$report | Out-File "mcp_test_report_2.txt" -Encoding UTF8
Write-Host "Done phase 2!"
