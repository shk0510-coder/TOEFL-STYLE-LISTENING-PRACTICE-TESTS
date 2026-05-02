const TESTS = [
  { id: "listening_test1", label: "Test 1", file: "data/listening_test1.json" },
  { id: "listening_test2", label: "Test 2", file: "data/listening_test2.json" },
  { id: "listening_test3", label: "Test 3", file: "data/listening_test3.json" },
  { id: "listening_test4", label: "Test 4", file: "data/listening_test4.json" },
  { id: "listening_test5", label: "Test 5", file: "data/listening_test5.json" }
];

const AUTO_PLAY_DELAY_MS = 1200;

const mainEl = document.getElementById("main");
const statusEl = document.getElementById("status");
const subtitleEl = document.getElementById("subtitle");
const backBtn = document.getElementById("backBtn");
const nextBtn = document.getElementById("nextBtn");

let testData = null;
let testId = TESTS[0].id;
let view = "start"; // start | moduleIntro | screen | results
let moduleIndex = 0;
let screenIndex = 0;
let answers = [];
let audioState = [];
let moduleScreens = [];
let currentAudio = null;
let autoPlayTimer = null;

function escapeHtml(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function setStatus(text){ statusEl.textContent = text || ""; }

function setNav(backEnabled, nextEnabled, nextLabel="Next"){
  backBtn.disabled = !backEnabled;
  nextBtn.disabled = !nextEnabled;
  nextBtn.textContent = nextLabel;
}

function getModule(){ return testData.modules[moduleIndex]; }
function getScreen(){ return moduleScreens[moduleIndex][screenIndex]; }
function getBaseItem(){ return getModule().items[getScreen().itemIndex]; }
function getSavedAnswer(){ return answers[moduleIndex][getScreen().itemIndex]; }
function getSavedAudio(){ return audioState[moduleIndex][getScreen().itemIndex]; }

function getCurrentTestLabel(){
  return (TESTS.find(t => t.id === testId) || TESTS[0]).label;
}

function buildModuleScreens(){
  moduleScreens = testData.modules.map(mod => {
    const screens = [];
    mod.items.forEach((item, itemIndex) => {
      if (item.kind === "response"){
        screens.push({ kind: "response", itemIndex, questionNumber: item.number });
      } else {
        item.questions.forEach((q, questionIndex) => {
          screens.push({ kind: "setQuestion", itemIndex, questionIndex, questionNumber: q.number, setType: item.setType });
        });
      }
    });
    return screens;
  });
}

function initState(){
  answers = testData.modules.map(mod => mod.items.map(item => {
    if (item.kind === "response") return { selectedIndex: null };
    return { selectedIndexes: item.questions.map(() => null) };
  }));

  audioState = testData.modules.map(mod => mod.items.map(() => ({
    played: false,
    finished: false,
    playing: false,
    failed: false,
    blocked: false
  })));

  buildModuleScreens();
}

function clearAutoPlayTimer(){
  if (autoPlayTimer){
    clearTimeout(autoPlayTimer);
    autoPlayTimer = null;
  }
}

function stopAudio(){
  clearAutoPlayTimer();
  if (currentAudio){
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  audioState.forEach(mod => mod.forEach(item => item.playing = false));
}

async function loadTest(){
  const test = TESTS.find(t => t.id === testId) || TESTS[0];
  setStatus("Loading...");
  const res = await fetch(test.file, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${test.file}`);
  testData = await res.json();
  initState();
  moduleIndex = 0;
  screenIndex = 0;
  view = "moduleIntro";
  render();
}

function visualMarkup(type){
  if (type === "student_woman"){
    return `<div class="visualCard"><div class="avatar">👩</div><div class="visualLabel">Speaker</div></div>`;
  }
  if (type === "student_man"){
    return `<div class="visualCard"><div class="avatar is-alt">👨</div><div class="visualLabel">Speaker</div></div>`;
  }
  if (type === "conversation_students"){
    return `<div class="visualCard"><div class="visualPair"><div><div class="avatar">👩</div><div class="visualLabel">Student</div></div><div><div class="avatar is-alt">👨</div><div class="visualLabel">Student</div></div></div></div>`;
  }
  if (type === "announcement_campus"){
    return `<div class="visualCard"><div class="avatar">📢</div><div class="visualLabel">Campus Announcement</div></div>`;
  }
  return `<div class="visualCard"><div class="avatar is-alt">👩‍🏫</div><div class="visualLabel">Academic Talk</div></div>`;
}

function currentQuestionDisplay(){
  return `Question ${getScreen().questionNumber} of 18`;
}

function screenAnswered(){
  const screen = getScreen();
  const saved = getSavedAnswer();
  if (screen.kind === "response") return saved.selectedIndex !== null;
  return saved.selectedIndexes[screen.questionIndex] !== null;
}

function hasPreviousScreen(){
  if (view === "start") return false;
  if (view === "results") return true;
  if (view === "moduleIntro") return moduleIndex > 0 || screenIndex > 0 || moduleIndex === 0;
  return true;
}

function canGoNext(){
  if (view === "start") return true;
  if (view === "moduleIntro") return true;
  if (view === "results") return false;
  return screenAnswered();
}

function nextLabel(){
  if (view === "start") return "Load";
  if (view === "moduleIntro") return "Start Module";
  if (view === "results") return "Next";
  const lastModule = moduleIndex === testData.modules.length - 1;
  const lastScreen = screenIndex === moduleScreens[moduleIndex].length - 1;
  if (lastModule && lastScreen) return "Finish & Score";
  if (lastScreen) return "Next Module";
  return "Next";
}

function updateNav(){
  setNav(hasPreviousScreen(), canGoNext(), nextLabel());
}

function renderStart(){
  subtitleEl.textContent = "MVP";
  setStatus("Ready");
  const options = TESTS.map(t => `<option value="${t.id}">${escapeHtml(t.label)}</option>`).join("");
  mainEl.innerHTML = `
    <div class="card">
      <h1 class="h1">TOEFL Listening Practice</h1>
      <p class="p">Select a test and click <b>Load</b>. The layout matches your Reading app, while Listening follows auto-play audio and single-question progression.</p>
      <div class="hr"></div>
      <div class="startGrid">
        <label>
          <div class="qnum">Test</div>
          <select id="testSelect" class="select">${options}</select>
        </label>
        <button id="loadBtn" class="btn">Load</button>
      </div>
      <div class="smallNote">
        Audio starts automatically after a short delay once each screen appears. If autoplay is blocked by the browser, a fallback play button will appear.
      </div>
    </div>
  `;
  const sel = document.getElementById("testSelect");
  sel.value = testId;
  document.getElementById("loadBtn").addEventListener("click", async ()=>{
    testId = sel.value;
    try{ await loadTest(); }
    catch(err){
      console.error(err);
      mainEl.innerHTML = `<div class="card"><h1 class="h1">Could not load the test</h1><p class="p">${escapeHtml(err.message)}</p></div>`;
      setStatus("Error");
      setNav(false, false, "Load");
    }
  });
  updateNav();
}

function renderModuleIntro(){
  const mod = getModule();
  subtitleEl.textContent = `${getCurrentTestLabel()} • ${mod.title}`;
  setStatus(`${mod.title} • Ready`);
  mainEl.innerHTML = `
    <div class="card">
      <h1 class="h1">${escapeHtml(mod.title)}</h1>
      <p class="p">Difficulty: ${escapeHtml(mod.difficulty)}</p>
      <div class="hr"></div>
      <div class="moduleList">
        <div><b>Q1–8:</b> Listen and Choose a Response</div>
        <div><b>Q9–12:</b> Listen to Conversations</div>
        <div><b>Q13–14:</b> Listen to an Announcement</div>
        <div><b>Q15–18:</b> Listen to an Academic Talk</div>
      </div>
      <div class="smallNote">
        After you start the module, each screen will attempt to play audio automatically after a short delay. Conversation, announcement, and talk audio plays once, but the related questions appear one at a time.
      </div>
    </div>
  `;
  updateNav();
}

function renderChoiceBlock(choices, selectedIndex, locked, qMeta = ""){
  return `
    <div class="qbox">
      ${qMeta ? `<div class="qnum">${qMeta}</div>` : ""}
      <div class="choices">
        ${choices.map((choice, idx)=>{
          const isSelected = selectedIndex === idx;
          const cls = `choice ${isSelected ? "is-selected" : ""} ${locked ? "is-disabled" : ""}`;
          return `
            <div class="${cls}" data-choice="${idx}">
              <div class="choice__tag">${"ABCD"[idx]}</div>
              <div class="choice__text">${escapeHtml(choice)}</div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function renderResponse(item, savedAudio, savedAnswer){
  const unlocked = savedAudio.played && savedAudio.finished;
  mainEl.innerHTML = `
    <div class="card">
      <div class="hero">
        <div class="hero__visual">${visualMarkup(item.visual)}</div>
        <div class="hero__panel">
          <div class="instructionPill">${escapeHtml(item.instruction)}</div>
          <div class="hr"></div>
          <div class="audioBox">
            <div class="qnum">${currentQuestionDisplay()}</div>
            <div class="qtext">${escapeHtml(item.instruction)}</div>
            <p class="audioNote">
              ${savedAudio.playing
                ? `<span class="audioReady">Audio is playing...</span>`
                : unlocked
                  ? `<span class="audioLocked">Audio completed. It cannot be replayed.</span>`
                  : savedAudio.blocked
                    ? `<span class="audioBlocked">Autoplay was blocked. Press the button below once.</span>`
                    : `Audio will start automatically.`}
            </p>
            ${(!savedAudio.played || savedAudio.blocked) ? `<button id="fallbackPlayBtn" class="btn ${savedAudio.blocked ? "" : "visuallyHidden"}">Play Audio</button>` : ""}
          </div>
          <div class="hr"></div>
          ${renderChoiceBlock(item.choices, savedAnswer.selectedIndex, !unlocked)}
        </div>
      </div>
    </div>
  `;

  const fallbackBtn = document.getElementById("fallbackPlayBtn");
  if (fallbackBtn){
    fallbackBtn.addEventListener("click", ()=> playAudioForCurrentScreen(true));
  }

  if (unlocked){
    document.querySelectorAll(".choice").forEach(el => {
      el.addEventListener("click", ()=>{
        savedAnswer.selectedIndex = Number(el.dataset.choice);
        render();
      });
    });
  }
  updateNav();
}

function renderSetQuestion(item, screen, savedAudio, savedAnswer){
  const q = item.questions[screen.questionIndex];
  const unlocked = savedAudio.played && savedAudio.finished;
  mainEl.innerHTML = `
    <div class="card">
      <div class="hero">
        <div class="hero__visual">${visualMarkup(item.visual)}</div>
        <div class="hero__panel">
          <div class="instructionPill">${escapeHtml(item.instruction)}</div>
          <div class="hr"></div>
          <div class="audioBox">
            <div class="qnum">${currentQuestionDisplay()}</div>
            <div class="qtext">${escapeHtml(item.instruction)}</div>
            <p class="audioNote">
              ${savedAudio.playing
                ? `<span class="audioReady">Audio is playing...</span>`
                : unlocked
                  ? `<span class="audioLocked">Audio completed. It cannot be replayed.</span>`
                  : savedAudio.blocked
                    ? `<span class="audioBlocked">Autoplay was blocked. Press the button below once.</span>`
                    : `Audio will start automatically.`}
            </p>
            ${(!savedAudio.played || savedAudio.blocked) ? `<button id="fallbackPlayBtn" class="btn ${savedAudio.blocked ? "" : "visuallyHidden"}">Play Audio</button>` : ""}
          </div>
          <div class="hr"></div>
          <div class="qbox">
            <div class="qnum">Question ${q.number}</div>
            <div class="qtext">${escapeHtml(q.question)}</div>
            <div class="choices">
              ${q.choices.map((choice, idx)=>{
                const isSelected = savedAnswer.selectedIndexes[screen.questionIndex] === idx;
                const cls = `choice ${isSelected ? "is-selected" : ""} ${!unlocked ? "is-disabled" : ""}`;
                return `
                  <div class="${cls}" data-choice="${idx}">
                    <div class="choice__tag">${"ABCD"[idx]}</div>
                    <div class="choice__text">${escapeHtml(choice)}</div>
                  </div>
                `;
              }).join("")}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const fallbackBtn = document.getElementById("fallbackPlayBtn");
  if (fallbackBtn){
    fallbackBtn.addEventListener("click", ()=> playAudioForCurrentScreen(true));
  }

  if (unlocked){
    document.querySelectorAll(".choice").forEach(el => {
      el.addEventListener("click", ()=>{
        savedAnswer.selectedIndexes[screen.questionIndex] = Number(el.dataset.choice);
        render();
      });
    });
  }
  updateNav();
}

function scheduleAutoPlay(){
  const item = getBaseItem();
  const state = getSavedAudio();
  if (state.played || state.playing || view !== "screen") return;
  clearAutoPlayTimer();
  autoPlayTimer = setTimeout(() => playAudioForCurrentScreen(false), AUTO_PLAY_DELAY_MS);
}

function renderScreen(){
  const mod = getModule();
  const screen = getScreen();
  const item = getBaseItem();
  const savedAudio = getSavedAudio();
  const savedAnswer = getSavedAnswer();
  subtitleEl.textContent = `${getCurrentTestLabel()} • ${mod.title}`;
  setStatus(`${mod.title} • ${currentQuestionDisplay()}`);

  if (screen.kind === "response"){
    renderResponse(item, savedAudio, savedAnswer);
  } else {
    renderSetQuestion(item, screen, savedAudio, savedAnswer);
  }

  scheduleAutoPlay();
}

function playAudioForCurrentScreen(fromFallback){
  const item = getBaseItem();
  const state = getSavedAudio();
  if (state.played || state.playing) return;

  clearAutoPlayTimer();
  if (currentAudio){
    currentAudio.pause();
    currentAudio.currentTime = 0;
  }

  state.played = true;
  state.playing = true;
  state.finished = false;
  state.blocked = false;
  state.failed = false;

  const audio = new Audio(item.audio);
  currentAudio = audio;
  render();

  audio.addEventListener("ended", ()=>{
    state.playing = false;
    state.finished = true;
    currentAudio = null;
    render();
  });

  audio.addEventListener("error", ()=>{
    state.playing = false;
    state.finished = false;
    state.played = false;
    state.failed = true;
    currentAudio = null;
    alert("Could not play the audio file. Check the file path and filename.");
    render();
  });

  const doPlay = fromFallback ? Promise.resolve() : Promise.resolve();
  doPlay.then(()=> audio.play()).catch(err => {
    console.error(err);
    state.playing = false;
    state.finished = false;
    state.played = false;
    state.blocked = true;
    currentAudio = null;
    render();
  });
}

function gradeAll(){
  const reviewed = [];
  let total = 0;
  let correct = 0;
  const moduleScores = testData.modules.map(() => ({ total: 0, correct: 0 }));

  testData.modules.forEach((mod, mi) => {
    mod.items.forEach((item, itemIndex) => {
      if (item.kind === "response"){
        total += 1;
        moduleScores[mi].total += 1;
        const selected = answers[mi][itemIndex].selectedIndex;
        const ok = selected === item.answerIndex;
        if (ok){ correct += 1; moduleScores[mi].correct += 1; }
        reviewed.push({
          module: mi + 1,
          number: item.number,
          prompt: item.instruction,
          isCorrect: ok,
          userAnswer: selected === null ? "" : item.choices[selected],
          correctAnswer: item.choices[item.answerIndex],
          explanation: item.explanation
        });
      } else {
        item.questions.forEach((q, qIdx) => {
          total += 1;
          moduleScores[mi].total += 1;
          const selected = answers[mi][itemIndex].selectedIndexes[qIdx];
          const ok = selected === q.answerIndex;
          if (ok){ correct += 1; moduleScores[mi].correct += 1; }
          reviewed.push({
            module: mi + 1,
            number: q.number,
            prompt: item.instruction,
            isCorrect: ok,
            userAnswer: selected === null ? "" : q.choices[selected],
            correctAnswer: q.choices[q.answerIndex],
            explanation: q.explanation
          });
        });
      }
    });
  });

  return { reviewed, total, correct, moduleScores };
}

function renderResults(){
  subtitleEl.textContent = "Results";
  const graded = gradeAll();
  setStatus(`Score: ${graded.correct}/${graded.total}`);
  mainEl.innerHTML = `
    <div class="card">
      <div class="resultHeader">
        <div>
          <h1 class="h1">Answer Key & Explanations</h1>
          <p class="p">Review your answers below.</p>
        </div>
        <div class="scoreBox">
          <p class="scoreLine">${graded.correct} / ${graded.total}</p>
          <p class="scoreSub">Module 1: ${graded.moduleScores[0].correct}/${graded.moduleScores[0].total} • Module 2: ${graded.moduleScores[1].correct}/${graded.moduleScores[1].total}</p>
        </div>
      </div>
      <div class="hr"></div>
      ${graded.reviewed.map(r => {
        const badge = r.isCorrect
          ? `<span class="badge good">Correct</span>`
          : `<span class="badge bad">Incorrect</span>`;
        const ua = r.userAnswer ? escapeHtml(r.userAnswer) : "<i>(no answer)</i>";
        return `
          <div class="reviewItem">
            <div class="reviewTop">
              <div class="qnum">Module ${r.module} • Q${r.number} • ${escapeHtml(r.prompt)}</div>
              ${badge}
            </div>
            <div class="reviewA"><b>Your answer:</b> ${ua}</div>
            <div class="reviewA"><b>Correct answer:</b> ${escapeHtml(r.correctAnswer)}</div>
            <div class="reviewExpl"><b>Explanation:</b> ${escapeHtml(r.explanation)}</div>
          </div>
        `;
      }).join("")}
    </div>
  `;
  updateNav();
}

function render(){
  stopAudio();
  if (view === "start") return renderStart();
  if (view === "moduleIntro") return renderModuleIntro();
  if (view === "screen") return renderScreen();
  return renderResults();
}

backBtn.addEventListener("click", ()=>{
  if (view === "start") return;

  if (view === "results"){
    view = "screen";
    moduleIndex = testData.modules.length - 1;
    screenIndex = moduleScreens[moduleIndex].length - 1;
    render();
    return;
  }

  if (view === "moduleIntro"){
    if (moduleIndex === 0){
      view = "start";
    } else {
      moduleIndex -= 1;
      view = "screen";
      screenIndex = moduleScreens[moduleIndex].length - 1;
    }
    render();
    return;
  }

  if (screenIndex > 0){
    screenIndex -= 1;
    render();
    return;
  }

  if (moduleIndex > 0){
    moduleIndex -= 1;
    view = "screen";
    screenIndex = moduleScreens[moduleIndex].length - 1;
    render();
    return;
  }

  view = "moduleIntro";
  render();
});

nextBtn.addEventListener("click", async ()=>{
  if (view === "start"){
    const sel = document.getElementById("testSelect");
    if (sel) testId = sel.value;
    try{ await loadTest(); }
    catch(err){
      console.error(err);
      mainEl.innerHTML = `<div class="card"><h1 class="h1">Could not load the test</h1><p class="p">${escapeHtml(err.message)}</p></div>`;
      setStatus("Error");
      setNav(false, false, "Load");
    }
    return;
  }

  if (view === "moduleIntro"){
    view = "screen";
    screenIndex = 0;
    render();
    return;
  }

  if (view === "results") return;

  const lastScreen = screenIndex === moduleScreens[moduleIndex].length - 1;
  const lastModule = moduleIndex === testData.modules.length - 1;

  if (lastScreen && lastModule){
    view = "results";
    render();
    return;
  }

  if (lastScreen){
    moduleIndex += 1;
    view = "moduleIntro";
    render();
    return;
  }

  screenIndex += 1;
  render();
});

render();
