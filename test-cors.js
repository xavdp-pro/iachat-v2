fetch('https://stt.zerux.com/transcribe', { method: 'OPTIONS' }).then(r => console.log(r.headers.get('access-control-allow-origin')))
