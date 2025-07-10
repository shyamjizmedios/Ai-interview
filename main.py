from fastapi import FastAPI, Request, Form, UploadFile
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
import shutil
import json
import google.generativeai as genai

# === Configure Gemini ===
genai.configure(api_key="AIzaSyCxUPGNRv3KHbCW_D2AwwygrXyok3DUYNE")  # 🔁 Replace with your actual key

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

# Mount static and templates
app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
templates = Jinja2Templates(directory="templates")

@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

# ✅ Use Gemini to dynamically generate questions
@app.get("/generate-questions")
def generate_questions(profile: str = "python developer", count: int = 5):
    try:
        model = genai.GenerativeModel("gemini-1.5-flash")

        prompt = f"""
        Generate {count} technical interview questions for a {profile}.
        Return only a JSON list, e.g.:
        [
            "What is Python?",
            "Explain OOPs concepts.",
            ...
        ]
        """

        response = model.generate_content(prompt)
        text = response.text.strip()

        # Try to extract a valid JSON list
        start = text.find('[')
        end = text.rfind(']') + 1
        questions = json.loads(text[start:end])

        return {"questions": questions}

    except Exception as e:
        return {"error": str(e), "questions": []}


import os
from datetime import datetime

@app.post("/upload-interview")
async def upload_video(video: UploadFile):
    os.makedirs("uploads", exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"interview_{timestamp}.webm"
    path = os.path.join("uploads", filename)

    with open(path, "wb") as f:
        shutil.copyfileobj(video.file, f)

    return {"status": "uploaded", "filename": filename, "url": f"/uploads/{filename}"}

@app.post("/get-user-performance")
async def get_user_performance():
    import cv2
    import mediapipe as mp

    # Setup
    face_mesh = mp.solutions.face_mesh.FaceMesh(refine_landmarks=True)
    VIDEO_PATH = r"C:\Users\Dell\PycharmProjects\my_ai_project\uploads\interview_20250708_124306.webm"
    cap = cv2.VideoCapture(VIDEO_PATH)

    gaze_log = {
        "left": 0, "center": 0, "right": 0,
        "up": 0, "mid": 0, "down": 0
    }

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        h, w, _ = frame.shape
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = face_mesh.process(rgb)

        if results.multi_face_landmarks:
            lm = results.multi_face_landmarks[0].landmark

            # Horizontal Gaze
            x1 = int(lm[33].x * w)
            x2 = int(lm[133].x * w)
            xi = int(lm[468].x * w)
            ratio_x = (xi - x1) / (x2 - x1 + 1e-6)

            if ratio_x < 0.4:
                gaze_log["left"] += 1
            elif ratio_x > 0.6:
                gaze_log["right"] += 1
            else:
                gaze_log["center"] += 1

            # Vertical Gaze
            y_top = int(lm[159].y * h)
            y_bottom = int(lm[145].y * h)
            yi = int(lm[468].y * h)
            ratio_y = (yi - y_top) / (y_bottom - y_top + 1e-6)

            if ratio_y < 0.4:
                gaze_log["up"] += 1
            elif ratio_y > 0.6:
                gaze_log["down"] += 1
            else:
                gaze_log["mid"] += 1

    cap.release()

    # Print Results
    total_h = gaze_log["left"] + gaze_log["center"] + gaze_log["right"]
    total_v = gaze_log["up"] + gaze_log["mid"] + gaze_log["down"]

    result = {}

    # Horizontal Gaze
    if total_h > 0:
        result["horizontal"] = {
            "left": round(gaze_log["left"] / total_h * 100, 2),
            "center": round(gaze_log["center"] / total_h * 100, 2),
            "right": round(gaze_log["right"] / total_h * 100, 2)
        }
    else:
        result["horizontal"] = "No horizontal data"

    # Vertical Gaze
    if total_v > 0:
        result["vertical"] = {
            "up": round(gaze_log["up"] / total_v * 100, 2),
            "mid": round(gaze_log["mid"] / total_v * 100, 2),
            "down": round(gaze_log["down"] / total_v * 100, 2)
        }
    else:
        result["vertical"] = "No vertical data"
    return result