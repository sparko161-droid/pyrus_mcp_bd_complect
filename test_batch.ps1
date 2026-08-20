$ErrorActionPreference = 'Continue'
$login = "admin@standartmaster.ru"
$security_key = "AoTR6E2Zq2G35ZivN95wr8CV5gyABUYny98S50cknXo20alXtVaHow4L7NpxZhe-~iyrZbCPr5NFpXBD7OK5pGs6UHZbXeom"
$person_id = 1238106
$base_url = "https://api.pyrus.com/v4"
$auth_body = @{ login = $login; security_key = $security_key; person_id = $person_id } | ConvertTo-Json
$auth_res = Invoke-RestMethod -Uri "$base_url/auth" -Method Post -Body $auth_body -ContentType "application/json"
$token = $auth_res.access_token
$headers = @{ Authorization = "Bearer $token" }

$t1 = Invoke-RestMethod -Uri "$base_url/tasks" -Method Post -Body (@{text="Batch task 1"} | ConvertTo-Json) -Headers $headers -ContentType "application/json"
$t2 = Invoke-RestMethod -Uri "$base_url/tasks" -Method Post -Body (@{text="Batch task 2"} | ConvertTo-Json) -Headers $headers -ContentType "application/json"

$id1 = $t1.task.id
$id2 = $t2.task.id
Write-Host "Created tasks: $id1, $id2"

# Batch update
$payload1 = @{ text = "Batch updated"; action = "finished" }
Invoke-RestMethod -Uri "$base_url/tasks/$id1/comments" -Method Post -Body ($payload1 | ConvertTo-Json) -Headers $headers -ContentType "application/json" | Out-Null
Invoke-RestMethod -Uri "$base_url/tasks/$id2/comments" -Method Post -Body ($payload1 | ConvertTo-Json) -Headers $headers -ContentType "application/json" | Out-Null
Write-Host "Batch updated and finished!"
