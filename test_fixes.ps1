$ErrorActionPreference = 'Continue'
$login = "admin@standartmaster.ru"
$security_key = "AoTR6E2Zq2G35ZivN95wr8CV5gyABUYny98S50cknXo20alXtVaHow4L7NpxZhe-~iyrZbCPr5NFpXBD7OK5pGs6UHZbXeom"
$person_id = 1238106
$base_url = "https://api.pyrus.com/v4"
$auth_body = @{ login = $login; security_key = $security_key; person_id = $person_id } | ConvertTo-Json
$auth_res = Invoke-RestMethod -Uri "$base_url/auth" -Method Post -Body $auth_body -ContentType "application/json"
$token = $auth_res.access_token
$files_url = if ($auth_res.files_url) { $auth_res.files_url } else { $base_url }
$headers = @{ Authorization = "Bearer $token" }

$kb_id = "IojGa0rF7xD"
Invoke-RestMethod -Uri "$base_url/knowledgebase/$kb_id" -Method Delete -Headers $headers
Write-Host "Deleted KB: $kb_id"

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
Write-Host "Uploaded file: $guid"

# Attach to task 374275851
$comment_payload = @{
    text = "Attaching a test file"
    attachments = @($guid)
}
$comment = Invoke-RestMethod -Uri "$base_url/tasks/374275851/comments" -Method Post -Body ($comment_payload | ConvertTo-Json) -Headers $headers -ContentType "application/json"

# Wait, Pyrus task API returns the actual attachment ID!
$real_file_id = $comment.task.attachments[0].id
if (!$real_file_id) { $real_file_id = $comment.task.comments[-1].attachments[0].id }
Write-Host "Real attachment ID: $real_file_id"

$dl = Invoke-RestMethod -Uri "$files_url/files/download/$real_file_id" -Method Get -Headers $headers
Write-Host "Downloaded file len: $($dl.Length)"
