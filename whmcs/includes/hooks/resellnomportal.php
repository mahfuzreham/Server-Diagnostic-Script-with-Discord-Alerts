<?php
use WHMCS\ClientArea;

if (!defined('WHMCS')) { exit('This file cannot be accessed directly'); }

add_hook('ClientAreaPrimaryNavbar', 1, function($primaryNavbar) {
    if (!isset($_SESSION['uid']) || !$primaryNavbar) return;
    $primaryNavbar->addChild('ResellNom Managed Servers', [
        'uri' => 'index.php?m=resellnomportal',
        'order' => 60,
    ]);
});

add_hook('ClientAreaPage', 1, function($vars) {
    if (!isset($_SESSION['uid'])) return;
    return [
        'resellnom_client_id' => (int)$_SESSION['uid'],
        'resellnom_portal_enabled' => true,
    ];
});
