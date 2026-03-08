<?php
// Proxies the Strava token refresh so CLIENT_SECRET never reaches the browser.
// strava_config.php must be placed one directory above public_html (outside the webroot).
require_once dirname(dirname(__DIR__)) . '/strava_config.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
$refreshToken = $input['refresh_token'] ?? null;

if (!$refreshToken) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing refresh_token']);
    exit;
}

$ch = curl_init('https://www.strava.com/oauth/token');
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
    CURLOPT_POSTFIELDS     => json_encode([
        'client_id'     => STRAVA_CLIENT_ID,
        'client_secret' => STRAVA_CLIENT_SECRET,
        'refresh_token' => $refreshToken,
        'grant_type'    => 'refresh_token',
    ]),
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

http_response_code($httpCode);
echo $response;
