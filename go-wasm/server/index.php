<?php

header('Access-Control-Allow-Origin: *');
header('Content-type: application/wasm');

echo file_get_contents(__DIR__ . '/../test.wasm');

