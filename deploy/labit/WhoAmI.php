<?php
/*
 * WhoAmI.php — devuelve el contact_id asociado a un token de sesión de Labit.
 *
 * Lo usa el backend de PinGGo (server-to-server) para validar el token que envía Skylab
 * en el exchange: POST JSON {"token": "..."}
 *   200 {"contact_id": 69}         token válido (usuario activo)
 *   401 {"error": "Invalid token"} token desconocido o usuario inactivo
 *   400 / 403 / 405                petición mal formada / IP no permitida / método
 *
 * No devuelve ningún otro dato del usuario. Solo acepta llamadas desde las IPs de
 * WHOAMI_ALLOWED_IPS (la IP estática del servidor de PinGGo), para que no sirva de
 * oráculo de tokens desde internet.
 */

require_once __DIR__ . '/utils/ConexionDB.php';

// IP estática de pinggo-prod (Lightsail) + localhost para pruebas en el propio servidor
const WHOAMI_ALLOWED_IPS = array('3.69.56.232', '127.0.0.1', '::1');

header('Content-Type: application/json');

function respond($status, $body)
{
    http_response_code($status);
    echo json_encode($body);
    exit;
}

if (!in_array($_SERVER['REMOTE_ADDR'] ?? '', WHOAMI_ALLOWED_IPS, true)) {
    respond(403, array('error' => 'Forbidden'));
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    respond(405, array('error' => 'Method not allowed'));
}

$data = json_decode(file_get_contents('php://input'), true);
$token = (is_array($data) && isset($data['token']) && is_string($data['token'])) ? trim($data['token']) : '';

if ($token === '') {
    respond(400, array('error' => 'token is required'));
}

$db = ConexionDB();
$query = $db->prepare('SELECT contact_id FROM people WHERE token = ? AND Active = 1 LIMIT 1');
$query->execute(array($token));
$row = $query->fetch(PDO::FETCH_ASSOC);

if (!$row) {
    respond(401, array('error' => 'Invalid token'));
}

respond(200, array('contact_id' => (int) $row['contact_id']));
