$ErrorActionPreference = 'Continue'
$login = "admin@standartmaster.ru"
$security_key = "AoTR6E2Zq2G35ZivN95wr8CV5gyABUYny98S50cknXo20alXtVaHow4L7NpxZhe-~iyrZbCPr5NFpXBD7OK5pGs6UHZbXeom"
$person_id = 1238106
$base_url = "https://api.pyrus.com/v4"
$auth_body = @{ login = $login; security_key = $security_key; person_id = $person_id } | ConvertTo-Json
$auth_res = Invoke-RestMethod -Uri "$base_url/auth" -Method Post -Body $auth_body -ContentType "application/json"
$token = $auth_res.access_token
$headers = @{ Authorization = "Bearer $token" }

try {
    $kb_create = @{ title = "Test KB from MCP"; body = "This is a test document." }
    $kb_new = Invoke-RestMethod -Uri "$base_url/knowledgebase" -Method Post -Body ($kb_create | ConvertTo-Json) -Headers $headers -ContentType "application/json"
    $kb_new | ConvertTo-Json -Depth 5
} catch {
    Write-Host "Error: $_"
    if ($_.ErrorDetails) {
        Write-Host "Details: $($_.ErrorDetails.Message)"
    } else {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $responseBody = $reader.ReadToEnd()
        Write-Host "Body: $responseBody"
    }
}
