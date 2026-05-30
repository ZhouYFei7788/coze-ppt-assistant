// State Variables
let pptSourceMode = 'url'; // 'url' or 'file'
let audioSourceMode = 'record'; // 'record' or 'upload'
let mediaRecorder = null;
let audioChunks = [];
let audioBlob = null;
let uploadedAudioFile = null;
let recordingTimerInterval = null;
let secondsRecorded = 0;
let audioContext = null;
let analyser = null;
let dataArray = null;
let sourceNode = null;
let animationFrameId = null;

// DOM Elements
const form = document.getElementById('defense-form');
const tabUrl = document.getElementById('tab-url');
const tabFile = document.getElementById('tab-file');
const pptUrlContainer = document.getElementById('ppt-url-container');
const pptFileContainer = document.getElementById('ppt-file-container');
const pptDropzone = document.getElementById('ppt-dropzone');
const inputPptFile = document.getElementById('input-ppt-file');
const pptFileInfo = document.getElementById('ppt-file-info');
const pptFilename = document.getElementById('ppt-filename');

const recorderStatus = document.getElementById('recorder-status');
const canvas = document.getElementById('waveform-canvas');
const canvasCtx = canvas.getContext('2d');
const recordingTimer = document.getElementById('recording-timer');
const btnStartRecord = document.getElementById('btn-start-record');
const btnStopRecord = document.getElementById('btn-stop-record');
const audioPreviewContainer = document.getElementById('audio-preview-container');
const audioPlayback = document.getElementById('audio-playback');
const audioMetaText = document.getElementById('audio-meta-text');

const btnSubmitAll = document.getElementById('btn-submit-all');
const progressOverlay = document.getElementById('progress-overlay');
const progressBarFill = document.getElementById('progress-bar-fill');
const stepUploadPPT = document.getElementById('step-upload-ppt');
const stepUploadAudio = document.getElementById('step-upload-audio');
const stepCallCoze = document.getElementById('step-call-coze');

const resultContainer = document.getElementById('result-container');
const resultStatusBadge = document.getElementById('result-status-badge');
const resultPptUrl = document.getElementById('result-ppt-url');
const resultPptPath = document.getElementById('result-ppt-path');
const resultAudioUrl = document.getElementById('result-audio-url');
const resultAudioPath = document.getElementById('result-audio-path');
const resultAudioSize = document.getElementById('result-audio-size');
const resultJsonBlock = document.getElementById('result-json-block');

// Audio upload DOM elements
const tabRecord = document.getElementById('tab-record');
const tabUploadAudio = document.getElementById('tab-upload-audio');
const audioRecordContainer = document.getElementById('audio-record-container');
const audioUploadContainer = document.getElementById('audio-upload-container');
const audioDropzone = document.getElementById('audio-dropzone');
const inputAudioFile = document.getElementById('input-audio-file');
const audioFileInfo = document.getElementById('audio-file-info');
const audioFilenameEl = document.getElementById('audio-filename');

// Set canvas initial display state
drawIdleWaveform();

// Switch between URL and Upload File sources
function switchPPTSource(mode) {
    pptSourceMode = mode;
    if (mode === 'url') {
        tabUrl.classList.add('active');
        tabFile.classList.remove('active');
        pptUrlContainer.classList.add('active');
        pptFileContainer.classList.remove('active');
        document.getElementById('input-ppt-url').setAttribute('required', 'true');
        inputPptFile.removeAttribute('required');
    } else {
        tabUrl.classList.remove('active');
        tabFile.classList.add('active');
        pptUrlContainer.classList.remove('active');
        pptFileContainer.classList.add('active');
        document.getElementById('input-ppt-url').removeAttribute('required');
        // File required only if no file is currently selected
        if (!inputPptFile.files.length) {
            inputPptFile.setAttribute('required', 'true');
        }
    }
}

// Drag and drop event listeners
['dragenter', 'dragover'].forEach(eventName => {
    pptDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        pptDropzone.classList.add('dragover');
    }, false);
});

['dragleave', 'drop'].forEach(eventName => {
    pptDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        pptDropzone.classList.remove('dragover');
    }, false);
});

pptDropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length) {
        inputPptFile.files = files;
        handlePPTFileSelection();
    }
});

inputPptFile.addEventListener('change', handlePPTFileSelection);

function handlePPTFileSelection() {
    if (inputPptFile.files.length) {
        const file = inputPptFile.files[0];
        // simple validation
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext !== 'pptx' && ext !== 'ppt') {
            alert('请上传有效的 PowerPoint 文件 (.pptx 或 .ppt)');
            clearPPTFile();
            return;
        }
        pptFilename.textContent = `${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
        pptFileInfo.classList.add('active');
        inputPptFile.removeAttribute('required');
    }
}

function clearPPTFile() {
    inputPptFile.value = '';
    pptFileInfo.classList.remove('active');
    if (pptSourceMode === 'file') {
        inputPptFile.setAttribute('required', 'true');
    }
}

// ─── Audio Source Toggle ───────────────────────────
function switchAudioSource(mode) {
    audioSourceMode = mode;
    if (mode === 'record') {
        tabRecord.classList.add('active');
        tabUploadAudio.classList.remove('active');
        audioRecordContainer.classList.add('active');
        audioUploadContainer.classList.remove('active');
    } else {
        tabRecord.classList.remove('active');
        tabUploadAudio.classList.add('active');
        audioRecordContainer.classList.remove('active');
        audioUploadContainer.classList.add('active');
    }
}

// Audio file upload: drag-and-drop
['dragenter', 'dragover'].forEach(eventName => {
    audioDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        audioDropzone.classList.add('dragover');
    }, false);
});

['dragleave', 'drop'].forEach(eventName => {
    audioDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        audioDropzone.classList.remove('dragover');
    }, false);
});

audioDropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length) {
        inputAudioFile.files = files;
        handleAudioFileSelection();
    }
});

inputAudioFile.addEventListener('change', handleAudioFileSelection);

function handleAudioFileSelection() {
    if (inputAudioFile.files.length) {
        const file = inputAudioFile.files[0];
        const ext = file.name.split('.').pop().toLowerCase();
        if (!['mp3', 'wav', 'ogg', 'm4a', 'webm'].includes(ext)) {
            alert('请上传有效的音频文件 (.mp3, .wav, .ogg, .m4a, .webm)');
            clearAudioFile();
            return;
        }
        uploadedAudioFile = file;
        audioFilenameEl.textContent = `${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
        audioFileInfo.classList.add('active');
    }
}

function clearAudioFile() {
    inputAudioFile.value = '';
    uploadedAudioFile = null;
    audioFileInfo.classList.remove('active');
}

// Audio Visualizer - Idle flat line
function drawIdleWaveform() {
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
    canvasCtx.strokeStyle = 'rgba(99, 102, 241, 0.4)';
    canvasCtx.lineWidth = 2;
    canvasCtx.beginPath();
    canvasCtx.moveTo(0, canvas.height / 2);
    canvasCtx.lineTo(canvas.width, canvas.height / 2);
    canvasCtx.stroke();
}

// Start audio recording & setup visualizer
async function startRecording() {
    audioChunks = [];
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Setup MediaRecorder
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.addEventListener('dataavailable', event => {
            audioChunks.push(event.data);
        });

        mediaRecorder.addEventListener('stop', () => {
            audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const audioUrl = URL.createObjectURL(audioBlob);
            audioPlayback.src = audioUrl;
            
            // Show preview card
            audioPreviewContainer.classList.remove('d-none');
            audioMetaText.textContent = `文件大小: ${(audioBlob.size / 1024).toFixed(1)} KB`;
            
            // Clean up stream tracks
            stream.getTracks().forEach(track => track.stop());
            
            // Update UI status
            recorderStatus.className = 'status-badge ready';
            recorderStatus.querySelector('.badge-text').textContent = '录音已生成';
        });

        // Setup Web Audio API for Live Waveform
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        sourceNode = audioContext.createMediaStreamSource(stream);
        sourceNode.connect(analyser);

        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);

        // Start MediaRecorder
        mediaRecorder.start();
        
        // UI transitions
        btnStartRecord.classList.add('d-none');
        btnStopRecord.classList.remove('d-none');
        audioPreviewContainer.classList.add('d-none');
        
        recorderStatus.className = 'status-badge recording';
        recorderStatus.querySelector('.badge-text').textContent = '正在录音...';

        // Start Timer
        secondsRecorded = 0;
        recordingTimer.textContent = '00:00';
        clearInterval(recordingTimerInterval);
        recordingTimerInterval = setInterval(() => {
            secondsRecorded++;
            const mins = String(Math.floor(secondsRecorded / 60)).padStart(2, '0');
            const secs = String(secondsRecorded % 60).padStart(2, '0');
            recordingTimer.textContent = `${mins}:${secs}`;
        }, 1000);

        // Start Visualizer Loop
        drawLiveWaveform();

    } catch (err) {
        console.error('Error opening microphone:', err);
        alert('无法启动录音: 请检查浏览器麦克风权限！');
    }
}

// Stop audio recording
function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    clearInterval(recordingTimerInterval);
    
    // Stop visualizer animation
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
    if (audioContext) {
        audioContext.close();
    }
    
    btnStartRecord.classList.remove('d-none');
    btnStopRecord.classList.add('d-none');
    drawIdleWaveform();
}

// Reset recording back to default
function resetRecording() {
    audioBlob = null;
    audioPlayback.src = '';
    audioPreviewContainer.classList.add('d-none');
    recordingTimer.textContent = '00:00';
    recorderStatus.className = 'status-badge';
    recorderStatus.querySelector('.badge-text').textContent = '准备就绪';
    drawIdleWaveform();
}

// Draw live waveform on Canvas
function drawLiveWaveform() {
    animationFrameId = requestAnimationFrame(drawLiveWaveform);
    
    analyser.getByteFrequencyData(dataArray);
    
    canvasCtx.fillStyle = 'rgba(15, 23, 42, 0.2)'; // semi-transparent background overlay to create trailing effect
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
    
    const barWidth = (canvas.width / dataArray.length) * 1.8;
    let barHeight;
    let x = 0;
    
    for (let i = 0; i < dataArray.length; i++) {
        barHeight = dataArray[i] / 2; // scaled down to fit visualizer
        
        // Custom HSL gradient matching our style (indigo to cyan)
        const hue = (i / dataArray.length) * 120 + 200; // 200 (blue) to 320 (purple)
        canvasCtx.fillStyle = `hsla(${hue}, 85%, 60%, 0.8)`;
        
        // Draw symmetrical audio bars (mirror effect)
        canvasCtx.fillRect(x, (canvas.height - barHeight) / 2, barWidth, barHeight);
        
        x += barWidth + 2;
    }
}

// Close assessment results container
function closeResult() {
    resultContainer.classList.add('d-none');
}

// Submit forms and upload recordings
async function submitDefenseData() {
    // Basic validations
    const email = document.getElementById('input-email').value.trim();
    const ccEmail = document.getElementById('input-cc-email').value.trim();
    const groupName = document.getElementById('input-group').value.trim();
    const pptUrl = document.getElementById('input-ppt-url').value.trim();
    const pptFile = inputPptFile.files[0];

    if (!email) {
        alert('请输入电子邮箱');
        return;
    }
    if (!groupName) {
        alert('请输入小组名称');
        return;
    }
    if (pptSourceMode === 'url' && !pptUrl) {
        alert('请输入 PPT 链接');
        return;
    }
    if (pptSourceMode === 'file' && !pptFile) {
        alert('请选择需要上传的 PPT 文件');
        return;
    }

    // Prepare UI loading overlay
    progressOverlay.classList.remove('d-none');
    setStepState(stepUploadPPT, 'active');
    setStepState(stepUploadAudio, 'pending');
    setStepState(stepCallCoze, 'pending');
    progressBarFill.style.width = '10%';

    // Construct FormData object
    const formData = new FormData();
    formData.append('email', email);
    formData.append('cc_email', ccEmail);
    formData.append('group_name', groupName);

    if (pptSourceMode === 'url') {
        formData.append('ppt_url', pptUrl);
    } else {
        formData.append('ppt_file', pptFile);
    }

    progressBarFill.style.width = '30%';

    // Step 2: Handle recorded audio if any
    setStepState(stepUploadPPT, 'completed');
    setStepState(stepUploadAudio, 'active');
    
    if (audioSourceMode === 'record' && audioBlob) {
        formData.append('audio_file', audioBlob, 'recording.webm');
        progressBarFill.style.width = '60%';
    } else if (audioSourceMode === 'upload' && uploadedAudioFile) {
        formData.append('audio_file', uploadedAudioFile);
        progressBarFill.style.width = '60%';
    } else {
        console.log("No audio provided for submission.");
    }
    
    setStepState(stepUploadAudio, 'completed');
    setStepState(stepCallCoze, 'active');
    progressBarFill.style.width = '80%';

    try {
        const response = await fetch('/api/submit', {
            method: 'POST',
            body: formData
        });

        progressBarFill.style.width = '100%';
        setStepState(stepCallCoze, 'completed');
        
        // Add a slight delay for smooth transition
        setTimeout(async () => {
            progressOverlay.classList.add('d-none');
            const data = await response.json();
            
            if (response.ok && data.status === 'success') {
                displayResults(data);
            } else {
                displayErrors(data, response.status);
            }
        }, 800);

    } catch (err) {
        console.error('Request submission error:', err);
        progressOverlay.classList.add('d-none');
        alert('网络请求失败，请确保本地服务器正常启动！\n错误: ' + err.message);
    }
}

// Stepper status update helper
function setStepState(element, state) {
    const icon = element.querySelector('.step-icon');
    element.className = `step ${state}`;
    
    if (state === 'pending') {
        icon.innerHTML = '<i class="fa-solid fa-circle-notch"></i>';
    } else if (state === 'active') {
        icon.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    } else if (state === 'completed') {
        icon.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
    } else if (state === 'error') {
        icon.innerHTML = '<i class="fa-solid fa-circle-exclamation text-danger"></i>';
    }
}

// Render success results
function displayResults(data) {
    resultContainer.classList.remove('d-none');
    
    resultStatusBadge.className = 'status-indicator success';
    resultStatusBadge.textContent = `成功 (${data.coze_status_code})`;
    
    resultPptUrl.textContent = data.ppt_url_used;
    resultPptUrl.href = data.ppt_url_used;
    
    if (data.audio_url_used) {
        resultAudioUrl.textContent = data.audio_url_used;
        resultAudioUrl.href = data.audio_url_used;
    } else {
        resultAudioUrl.textContent = '无 (未生成公网 URL)';
        resultAudioUrl.removeAttribute('href');
    }
    
    resultPptPath.textContent = data.saved_ppt_path || '使用在线 URL (未保存本地)';
    resultAudioPath.textContent = data.saved_audio_path || '未录制语音';
    
    if (data.audio_info && data.audio_info.size_bytes) {
        resultAudioSize.textContent = `${(data.audio_info.size_bytes / 1024).toFixed(1)} KB`;
    } else {
        resultAudioSize.textContent = '-';
    }
    
    // Display parsed json elegantly
    resultJsonBlock.textContent = JSON.stringify(data.coze_response, null, 2);
    
    // Scroll result container into view smoothly
    resultContainer.scrollIntoView({ behavior: 'smooth' });
}

// Render error results
function displayErrors(data, httpStatus) {
    resultContainer.classList.remove('d-none');
    
    resultStatusBadge.className = 'status-indicator error';
    resultStatusBadge.textContent = `错误 (${httpStatus})`;
    
    resultPptUrl.textContent = '-';
    resultPptUrl.removeAttribute('href');
    resultAudioUrl.textContent = '-';
    resultAudioUrl.removeAttribute('href');
    
    resultPptPath.textContent = data.saved_ppt_path || '-';
    resultAudioPath.textContent = data.saved_audio_path || '-';
    
    if (data.audio_info && data.audio_info.size_bytes) {
        resultAudioSize.textContent = `${(data.audio_info.size_bytes / 1024).toFixed(1)} KB`;
    } else {
        resultAudioSize.textContent = '-';
    }
    
    resultJsonBlock.textContent = JSON.stringify(data, null, 2);
    resultContainer.scrollIntoView({ behavior: 'smooth' });
}
