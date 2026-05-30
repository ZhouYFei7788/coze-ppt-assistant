import os
import ssl
import json
import uuid
import requests
import urllib3
import alibabacloud_oss_v2 as oss
from fastapi import FastAPI, UploadFile, Form, File, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from requests.adapters import HTTPAdapter
from urllib3.poolmanager import PoolManager
from typing import Optional

# Disable SSL warnings as requested in user's script
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class SSLAdapter(HTTPAdapter):
    def init_poolmanager(self, connections, maxsize, block=False):
        self.poolmanager = PoolManager(
            num_pools=connections, 
            maxsize=maxsize, 
            block=block, 
            ssl_version=ssl.PROTOCOL_TLSv1_2
        )

app = FastAPI(title="Coze PPT AI Defense Assistant")

# CORS middleware for development flexibility
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Try to load local .env configuration file if exists
dotenv_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
if os.path.exists(dotenv_path):
    print("Loading configurations from .env file...")
    with open(dotenv_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                os.environ[key.strip()] = val.strip()

# Constants & Configurations
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
PPT_DIR = os.path.join(UPLOAD_DIR, "ppt")
AUDIO_DIR = os.path.join(UPLOAD_DIR, "recordings")
COZE_URL = "https://mc4rrp765v.coze.site/run"
COZE_AUTH = "Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6ImZjZDQyMzI0LWY2ZDYtNDE3Mi1iNWMxLTYwN2Y5OTNmYTI0ZSJ9.eyJpc3MiOiJodHRwczovL2FwaS5jb3plLmNuIiwiYXVkIjpbIlJCZjRpZXpRc1NMVnFIOWswaHhnTlBiZ2VHMEZ5RW9YIl0sImV4cCI6ODIxMDI2Njg3Njc5OSwiaWF0IjoxNzgwMDUwNDY4LCJzdWIiOiJzcGlmZmU6Ly9hcGkuY296ZS5jbi93b3JrbG9hZF9pZGVudGl0eS9pZDo3NjQ1MjMyOTYxMDAzOTc4NzU4Iiwic3JjIjoiaW5ib3VuZF9hdXRoX2FjY2Vzc190b2tlbl9pZDo3NjQ1MjU4NTQ4OTM4NTM5MDQzIn0.lPWyXTvr1GXtCMk9uy9jzp1mVUI6AkRasR-FFfQGGTliLiAfpVOjCWEookJKboVlZNMn8PKgxoeZlTxFgP2jn5ExxEC3ry71VMDVKlWXE40GJp8FnnbmMK3mh6kkIzGRerJIvhesSmj1ffKXo-3mloq_E-Vw5bzXvox7VoLyWJxYBrtGTEzl9HegAMPjU2M2AtJBYy1u45UAiRC30mO3mGp370Jg2SwRN94Is9l_3UxxwFMLHhaWLnmLTF1WV-EeUgXkvCS7FFm587mkS42Bi7EnAZxH4Ek0cDjs56-WKYwPF6ymUBIjBtFC1FF8yitIuf6TM2e3kLKF-g8KKlS6VA"

# Create upload directories if they don't exist
os.makedirs(PPT_DIR, exist_ok=True)
os.makedirs(AUDIO_DIR, exist_ok=True)

# Aliyun OSS configurations
ALI_AK = os.environ.get("ALIBABA_CLOUD_ACCESS_KEY_ID") or os.environ.get("OSS_ACCESS_KEY_ID")
ALI_SK = os.environ.get("ALIBABA_CLOUD_ACCESS_KEY_SECRET") or os.environ.get("OSS_ACCESS_KEY_SECRET")
OSS_BUCKET = os.environ.get("OSS_BUCKET", "yulindi")
OSS_REGION = os.environ.get("OSS_REGION", "cn-chengdu")
OSS_ENDPOINT = os.environ.get("OSS_ENDPOINT", "oss-cn-chengdu.aliyuncs.com")

def is_oss_configured() -> bool:
    return bool(ALI_AK and ALI_SK)

def upload_to_aliyun_oss(file_path: str, filename: str) -> str:
    # Use StaticCredentialsProvider for flexible env var support
    credentials_provider = oss.credentials.StaticCredentialsProvider(ALI_AK, ALI_SK)
    cfg = oss.config.load_default()
    cfg.credentials_provider = credentials_provider
    cfg.region = OSS_REGION
    if OSS_ENDPOINT:
        cfg.endpoint = OSS_ENDPOINT
    
    client = oss.Client(cfg)
    
    # Prefix keys to structure uploads in the bucket
    if "ppt" in file_path.lower():
        key = f"uploads/ppt/{filename}"
    else:
        key = f"uploads/recordings/{filename}"
        
    print(f"Uploading to Aliyun OSS: bucket={OSS_BUCKET}, region={OSS_REGION}, key={key}")
    
    client.put_object_from_file(
        oss.PutObjectRequest(
            bucket=OSS_BUCKET,
            key=key,
            acl='public-read'
        ),
        file_path
    )
    
    # Construct download URL (https://{bucket}.{endpoint}/{key})
    endpoint_clean = OSS_ENDPOINT.replace("https://", "").replace("http://", "")
    public_url = f"https://{OSS_BUCKET}.{endpoint_clean}/{key}"
    return public_url

# Helper function to upload file to tmpfiles.org and return a direct download link
def upload_to_tmpfiles(file_path: str, filename: str, file_type_label: str = "file") -> str:
    try:
        with open(file_path, "rb") as f:
            files = {"file": (filename, f)}
            response = requests.post("https://tmpfiles.org/api/v1/upload", files=files)
            if response.status_code == 200:
                res_data = response.json()
                if res_data.get("status") == "success":
                    raw_url = res_data["data"]["url"]
                    # Convert to direct download url by inserting '/dl'
                    dl_url = raw_url.replace("https://tmpfiles.org/", "https://tmpfiles.org/dl/")
                    return dl_url
        raise Exception(f"Upload failed with status code {response.status_code}")
    except Exception as e:
        print(f"Error uploading {file_type_label} to tmpfiles.org: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to generate a public URL for the {file_type_label}. Please check your internet connection. Error: {str(e)}"
        )

# Public URL Router (Aliyun OSS with tmpfiles.org fallback)
def get_public_url(file_path: str, filename: str, file_type_label: str = "file") -> str:
    if is_oss_configured():
        try:
            url = upload_to_aliyun_oss(file_path, filename)
            print(f"Successfully uploaded {file_type_label} to Aliyun OSS: {url}")
            return url
        except Exception as e:
            print(f"Aliyun OSS upload failed, falling back to tmpfiles.org. Error: {str(e)}")
            return upload_to_tmpfiles(file_path, filename, file_type_label)
    else:
        print("Aliyun OSS is not configured (missing Access Key ID or Secret). Falling back to tmpfiles.org.")
        return upload_to_tmpfiles(file_path, filename, file_type_label)

@app.post("/api/submit")
async def handle_submit(
    email: str = Form(...),
    group_name: str = Form(...),
    cc_email: Optional[str] = Form(None),
    ppt_url: Optional[str] = Form(None),
    ppt_file: Optional[UploadFile] = File(None),
    audio_file: Optional[UploadFile] = File(None)
):
    saved_ppt_path = None
    saved_audio_path = None
    final_ppt_url = None
    final_audio_url = None
    audio_info = {}

    # 1. Process PPT (either URL or uploaded file)
    if ppt_file and ppt_file.filename:
        # User uploaded a file, save it locally first
        file_ext = os.path.splitext(ppt_file.filename)[1]
        unique_filename = f"{uuid.uuid4()}{file_ext}"
        local_path = os.path.join(PPT_DIR, unique_filename)
        
        with open(local_path, "wb") as buffer:
            content = await ppt_file.read()
            buffer.write(content)
        
        saved_ppt_path = local_path
        
        # Upload to target storage (OSS or tmpfiles.org fallback)
        final_ppt_url = get_public_url(local_path, unique_filename, "PPT file")
        print(f"Processed PPT file. Local path: {saved_ppt_path}, Public URL: {final_ppt_url}")
    elif ppt_url:
        final_ppt_url = ppt_url
        print(f"Using direct PPT URL: {final_ppt_url}")
    else:
        raise HTTPException(status_code=400, detail="Please provide either a PPT URL or upload a PPT file.")

    # 2. Process Audio Recording
    if audio_file and audio_file.filename:
        # Standard web audio recordings are typically webm/wav
        file_ext = os.path.splitext(audio_file.filename)[1] or ".webm"
        # Create a user-friendly name using group and email
        safe_group = "".join([c for c in group_name if c.isalnum() or c in ('-', '_')]).rstrip()
        safe_email = email.split("@")[0]
        unique_audio_name = f"{safe_group}_{safe_email}_{uuid.uuid4().hex[:8]}{file_ext}"
        local_audio_path = os.path.join(AUDIO_DIR, unique_audio_name)
        
        with open(local_audio_path, "wb") as buffer:
            content = await audio_file.read()
            buffer.write(content)
        
        saved_audio_path = local_audio_path
        
        # Upload to target storage (OSS or tmpfiles.org fallback)
        final_audio_url = get_public_url(local_audio_path, unique_audio_name, "Audio recording")
        
        audio_info = {
            "filename": unique_audio_name,
            "local_path": saved_audio_path,
            "size_bytes": os.path.getsize(saved_audio_path),
            "public_url": final_audio_url
        }
        print(f"Saved audio recording. Local path: {saved_audio_path}, Public URL: {final_audio_url}")

    # 3. Call Coze API
    headers = {
        "Authorization": COZE_AUTH,
        "Content-Type": "application/json"
    }
    
    payload = {
        "ppt_file": {
            "url": final_ppt_url,
            "file_type": "document"
        },
        "audio_file": {
            "url": final_audio_url or "",
            "file_type": "audio" if final_audio_url else ""
        },
        "group_name": group_name,
        "email": email,
        "cc_email": cc_email or ""
    }

    try:
        # Configure requests Session with custom SSLAdapter as in the user's script
        session = requests.Session()
        session.mount('https://', SSLAdapter())
        
        print("Sending request to Coze API...")
        print("Payload:", json.dumps(payload, ensure_ascii=False, indent=2))
        
        coze_response = session.post(COZE_URL, headers=headers, json=payload, verify=False)
        
        print(f"Coze response status: {coze_response.status_code}")
        print(f"Coze response body: {coze_response.text}")
        
        # Try to parse Coze response as JSON, fallback to raw text
        try:
            coze_json = coze_response.json()
        except Exception:
            coze_json = {"raw_text": coze_response.text}

        return JSONResponse(content={
            "status": "success",
            "ppt_url_used": final_ppt_url,
            "audio_url_used": final_audio_url,
            "saved_ppt_path": saved_ppt_path,
            "saved_audio_path": saved_audio_path,
            "audio_info": audio_info,
            "coze_status_code": coze_response.status_code,
            "coze_response": coze_json
        })

    except Exception as e:
        print(f"Error calling Coze API: {str(e)}")
        # Even if Coze API fails, return the saved info so the user doesn't lose their files
        return JSONResponse(status_code=500, content={
            "status": "partial_success",
            "message": f"Saved files but failed to call Coze API: {str(e)}",
            "saved_ppt_path": saved_ppt_path,
            "saved_audio_path": saved_audio_path,
            "audio_info": audio_info
        })

# Serve the static files
app.mount("/", StaticFiles(directory=os.path.join(os.path.dirname(os.path.abspath(__file__)), "static"), html=True), name="static")
