const videoElement = document.querySelector(".input_video");
const canvasElement = document.querySelector(".output_canvas");
const canvasCtx = canvasElement.getContext("2d");
const warning = document.getElementById("warning");
const questionDisplay = document.getElementById("question");
let questionTimeout;
let recognition;
let isAnswerRecorded = false;
let mediaRecorder;
let chunks = [];

//window.addEventListener("blur", () => {
//  warning.innerText = "⚠️ Tab or window switch detected!";
//});
//
//window.addEventListener("focus", () => {
//   warning.innerText = "";
//});
//
//document.addEventListener("visibilitychange", () => {
//  if (document.hidden) {
//    warning.innerText = "⚠️ Tab switch detected!";
//  }
//});



const faceDetection = new FaceDetection({
  locateFile: (file) =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`,
})
faceDetection.setOptions({ modelSelection: 0, minDetectionConfidence: 0.5 });

faceDetection.onResults((results) => {
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.drawImage(
    results.image,
    0,
    0,
    canvasElement.width,
    canvasElement.height
  );
  if (results.detections.length > 1) {
    warning.innerText = "⚠️ Multiple faces detected!";
  } else {
    warning.innerText = "";
  }
  canvasCtx.restore();
});

const camera = new Camera(videoElement, {
  onFrame: async () => await faceDetection.send({ image: videoElement }),
  width: 480,
  height: 360
});
camera.start();

async function fetchQuestions() {
  const res = await fetch("/generate-questions?profile=python+developer");
  const data = await res.json();
  return data.questions; // ✅ returns just the array
}

function recordAnswer(seconds = 60) {
  return new Promise((resolve) => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      if (!isAnswerRecorded) {
        isAnswerRecorded = true;
        resolve(event.results[0][0].transcript);
      }
    };

    recognition.onerror = () => {
      if (!isAnswerRecorded) {
        isAnswerRecorded = true;
        resolve("(No Answer)");
      }
    };

    recognition.onend = () => {
      if (!isAnswerRecorded) {
        isAnswerRecorded = true;
        resolve("(No Answer)");
      }
    };

    recognition.start();

    setTimeout(() => {
      if (recognition && !isAnswerRecorded) {
        recognition.stop();
      }
    }, seconds * 1000);
  });
}


let questions = [];
let currentQuestionIndex = 0;
let stream;

document.getElementById("nextBtn").addEventListener("click", handleNextQuestion);

async function startInterview() {
  questions = await fetchQuestions();

  stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.ondataavailable = e => chunks.push(e.data);
  mediaRecorder.start();

  currentQuestionIndex = 0;
  showQuestion();

  // 🟡 Start tab/window switch detection here
  enableTabSwitchWarnings();
}


function enableTabSwitchWarnings() {
  window.addEventListener("blur", () => {
    warning.innerText = "⚠️ Tab or window switch detected!";
  });

//  window.addEventListener("focus", () => {
//    warning.innerText = "";
//  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      warning.innerText = "⚠️ Tab switch detected!";
    }
  });
}


function showQuestion() {
  clearTimeout(questionTimeout);
  isAnswerRecorded = false;

  const q = questions[currentQuestionIndex];
  if (!q) {
    endInterview();
    return;
  }

  questionDisplay.innerText = `Q${currentQuestionIndex + 1}: ${q}`;

  const speak = new SpeechSynthesisUtterance(q);
  speechSynthesis.speak(speak);

  speak.onend = async () => {
    const answer = await recordAnswer(60); // record for up to 2 minutes

    // Send answer to backend
    await fetch("/score-answer", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ question: q, answer }),
    });

    // Set 2-minute timeout to auto move
    questionTimeout = setTimeout(() => {
      currentQuestionIndex++;
      if (currentQuestionIndex < questions.length) {
        showQuestion();
      } else {
        endInterview();
      }
    }, seconds = 10 * 1000);
  };
}


async function handleNextQuestion() {
  clearTimeout(questionTimeout);
  if (recognition) recognition.stop(); // early stop recording

  currentQuestionIndex++;
  if (currentQuestionIndex < questions.length) {
    showQuestion();
  } else {
    endInterview();
  }
}


function endInterview() {
  questionDisplay.innerText = "✅ Interview completed!";
  mediaRecorder.stop();

  mediaRecorder.onstop = () => {
    const blob = new Blob(chunks, { type: "video/webm" });
    const formData = new FormData();
    formData.append("video", blob, "interview.webm");

    fetch("/upload-interview", {
      method: "POST",
      body: formData,
    })
    .then(res => res.json())
    .then(data => {
      // Show video URL
      const videoURL = data.url;

      // Create and display the video player
      const videoTag = document.createElement("video");
      videoTag.src = videoURL;
      videoTag.controls = true;
      videoTag.width = 480;

      const link = document.createElement("a");
      link.href = videoURL;
      link.innerText = "📥 Download Interview Video";
      link.style.display = "block";
      link.style.marginTop = "10px";

      questionDisplay.innerText += "\n🎥 Watch your interview below:";
      document.body.appendChild(videoTag);
      document.body.appendChild(link);
    });
  };
}



