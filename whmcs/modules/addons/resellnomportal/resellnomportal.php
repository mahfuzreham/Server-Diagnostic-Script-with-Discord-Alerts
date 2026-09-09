<?php
if (!defined('WHMCS')) { exit('This file cannot be accessed directly'); }

function resellnomportal_config() {
    return [
        'name' => 'ResellNom Client Portal',
        'description' => 'Branded client portal bridge for ResellNom Monitor and WHMCS.',
        'version' => '1.0.0',
        'author' => 'ResellNom',
        'language' => 'english',
        'fields' => [
            'api_url' => ['FriendlyName'=>'Monitor API URL','Type'=>'text','Size'=>'60','Description'=>'Example: https://monitor.example.com'],
            'api_token' => ['FriendlyName'=>'Server-side API Token','Type'=>'password','Size'=>'60','Description'=>'Keep this secret; never expose it to clients.'],
        ],
    ];
}

function resellnomportal_activate() {
    return ['status'=>'success','description'=>'ResellNom Client Portal activated.'];
}
function resellnomportal_deactivate() {
    return ['status'=>'success','description'=>'ResellNom Client Portal deactivated.'];
}

function resellnomportal_output($vars) {
    echo '<div class="container-fluid"><h2>ResellNom Client Portal</h2><p>Configure the Monitor API connection, then use the client-area hook/widget for branded server status.</p></div>';
}
