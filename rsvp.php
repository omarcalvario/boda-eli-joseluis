<?php

// Replace with your email 
$mail_to = 'youremail@yourdomain.com';

if (isset($_POST['rsvp_name']) && isset($_POST['rsvp_email']) && filter_var($_POST['rsvp_email'], FILTER_VALIDATE_EMAIL) && isset($_POST['rsvp_events']) && isset($_POST['rsvp_guests'])) {
    // Collect POST data from form
    $rsvp_name = $_POST['rsvp_name'];
    $rsvp_email = $_POST['rsvp_email'];
    $rsvp_events = $_POST['rsvp_events'];
    $rsvp_guests = $_POST['rsvp_guests'];
    $rsvp_message = (strlen($_POST['rsvp_message'])) ? $_POST['rsvp_message'] : '-';

    // Prefedined variables  
    $subject = 'Loise Notification Mailer: Message from ' . $rsvp_name . '!';

    // Collecting all content in $content
    $content = 'RSVP Form' . "\r\n";
    $content .= 'Name: ' . $rsvp_name . "\r\n";
    $content .= 'Email: ' . $rsvp_email . "\r\n";
    $content .= 'Guests: ' . $rsvp_guests . "\r\n";
    $content .= 'Events: ' . $rsvp_events . "\r\n";
    $content .= 'Dietary Restrictions: ' . $rsvp_message . "\r\n";

    // Detect & prevent header injections
    $test = "/(content-type|bcc:|cc:|to:)/i";
    foreach ($_POST as $key => $val) {
        if (preg_match($test, $val)) {
            exit;
        }
    }

    $headers = 'From: ' . $rsvp_name . '<' . $rsvp_email . '>' . "\r\n" .
        'Reply-To: ' . $rsvp_email . "\r\n" .
        'X-Mailer: PHP/' . phpversion();

    // Send the message
    $send = false;
    if (mail($mail_to, $subject, $content, $headers)) {
        $send = true;
    }

    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($send);
}
