// Main Client Controller with Replay, Multi-Bot, Stats, Profile and Leaderboard
(function () {
  const socket = io();

  // Modals & Menu Elements
  const mainMenuModal = document.getElementById('mainMenuModal');
  const menuProfileStrip = document.getElementById('menuProfileStrip');
  const menuAvatarPreview = document.getElementById('menuAvatarPreview');
  const menuProfileNameText = document.getElementById('menuProfileNameText');
  const menuProfileStatsText = document.getElementById('menuProfileStatsText');
  const btnMenuEditProfile = document.getElementById('btnMenuEditProfile');
  const btnCancelMenuProfile = document.getElementById('btnCancelMenuProfile');

  const menuProfileForm = document.getElementById('menuProfileForm');
  const nicknameInput = document.getElementById('nicknameInput');
  const avatarInput = document.getElementById('avatarInput');

  const btnPlaySolo = document.getElementById('btnPlaySolo');
  const btnEnterLobby = document.getElementById('btnEnterLobby');
  const btnMenuLeaderboard = document.getElementById('btnMenuLeaderboard');
  const btnMenuProfile = document.getElementById('btnMenuProfile');
  const btnMenuHowToPlay = document.getElementById('btnMenuHowToPlay');
  const howToPlayBox = document.getElementById('howToPlayBox');
  const btnCloseHowToPlay = document.getElementById('btnCloseHowToPlay');
  const btnReturnToMenu = document.getElementById('btnReturnToMenu');
  const btnMenuSoundToggle = document.getElementById('btnMenuSoundToggle');
  const menuNowPlaying = document.getElementById('menuNowPlaying');
  const nowPlayingTitle = document.getElementById('nowPlayingTitle');
  const btnNowPlayingMute = document.getElementById('btnNowPlayingMute');

  // Header Profile & Leaderboard Buttons
  const btnOpenProfile = document.getElementById('btnOpenProfile');
  const btnOpenLeaderboard = document.getElementById('btnOpenLeaderboard');
  const headerProfileName = document.getElementById('headerProfileName');
  const headerProfileGoals = document.getElementById('headerProfileGoals');

  // Profile Modal Elements
  const profileModal = document.getElementById('profileModal');
  const profileModalAvatar = document.getElementById('profileModalAvatar');
  const profileModalName = document.getElementById('profileModalName');
  const profileModalRankBadge = document.getElementById('profileModalRankBadge');
  const profStatGoals = document.getElementById('profStatGoals');
  const profStatMatches = document.getElementById('profStatMatches');
  const profStatWins = document.getElementById('profStatWins');
  const profStatAvg = document.getElementById('profStatAvg');
  const profileEditAvatarInput = document.getElementById('profileEditAvatarInput');
  const btnProfileSaveAvatar = document.getElementById('btnProfileSaveAvatar');
  const btnProfileViewLeaderboard = document.getElementById('btnProfileViewLeaderboard');
  const btnChangeProfile = document.getElementById('btnChangeProfile');
  const btnCloseProfile = document.getElementById('btnCloseProfile');

  // Leaderboard Modal Elements
  const leaderboardModal = document.getElementById('leaderboardModal');
  const btnCloseLeaderboard = document.getElementById('btnCloseLeaderboard');
  const btnOpenLeaderboardFromStats = document.getElementById('btnOpenLeaderboardFromStats');
  const myRankText = document.getElementById('myRankText');
  const leaderboardTbody = document.getElementById('leaderboardTbody');

  const statsModal = document.getElementById('statsModal');
  const statsWinnerTitle = document.getElementById('statsWinnerTitle');
  const statsScoreText = document.getElementById('statsScoreText');
  const statRedPossession = document.getElementById('statRedPossession');
  const statBluePossession = document.getElementById('statBluePossession');
  const statRedShots = document.getElementById('statRedShots');
  const statBlueShots = document.getElementById('statBlueShots');
  const btnCloseStats = document.getElementById('btnCloseStats');
  const btnStartNewMatch = document.getElementById('btnStartNewMatch');
  const btnRestartMatch = document.getElementById('btnRestartMatch');
  const redGoalsList = document.getElementById('redGoalsList');
  const blueGoalsList = document.getElementById('blueGoalsList');
  const gameOverScorersList = document.getElementById('gameOverScorersList');

  // Canvas & Render Engine
  const canvas = document.getElementById('gameCanvas');
  const renderer = new GameRenderer(canvas);
  const inputManager = new InputManager(socket);

  window.addEventListener('resize', () => {
    if (renderer) renderer.resize();
  });
  window.addEventListener('orientationchange', () => {
    setTimeout(() => {
      if (renderer) renderer.resize();
    }, 150);
  });

  // Scoreboard & Live Stats Elements
  const scoreRedElem = document.getElementById('scoreRed');
  const scoreBlueElem = document.getElementById('scoreBlue');
  const matchTimerElem = document.getElementById('matchTime');
  const matchStateElem = document.getElementById('matchStateText');
  const possessionRed = document.getElementById('possessionRed');
  const possessionBlue = document.getElementById('possessionBlue');
  const possessionFill = document.getElementById('possessionFill');
  const possessionBarContainer = document.querySelector('.possession-bar-container');
  const hudBombBanner = document.getElementById('hudBombBanner');
  const hudBombTimer = document.getElementById('hudBombTimer');
  const hudBombTeam = document.getElementById('hudBombTeam');

  // DOM Dirty-Check Caches to eliminate 60Hz DOM reflows
  let lastScoreRed = -1;
  let lastScoreBlue = -1;
  let lastMatchTimeStr = '';
  let lastMatchStatus = '';
  let lastStatusColor = '';
  let lastPossessionRed = -1;
  let lastBombVisible = null;
  let lastBombTimer = -1;
  let lastBombTeamText = '';
  let lastBombClass = '';

  // Banners
  const goalBanner = document.getElementById('goalBanner');
  const goalBannerText = document.getElementById('goalBannerText');
  const goalTeamText = document.getElementById('goalTeamText');
  const overtimeBanner = document.getElementById('overtimeBanner');
  const gameOverBanner = document.getElementById('gameOverBanner');
  const winnerBannerText = document.getElementById('winnerBannerText');
  const finalScoreText = document.getElementById('finalScoreText');
  const walkoutBanner = document.getElementById('walkoutBanner');
  const btnSkipWalkout = document.getElementById('btnSkipWalkout');
  const kickoffWhistleBanner = document.getElementById('kickoffWhistleBanner');
  const goalMilestoneBadge = document.getElementById('goalMilestoneBadge');
  const goalMilestoneText = document.getElementById('goalMilestoneText');
  const kickoffCountdownOverlay = document.getElementById('kickoffCountdownOverlay');
  const countdownNumber = document.getElementById('countdownNumber');
  const countdownSubtext = document.getElementById('countdownSubtext');

  // Pre-Match Setup Modal & Header Elements
  const matchSetupModal = document.getElementById('matchSetupModal');
  const btnOpenMatchSetup = document.getElementById('btnOpenMatchSetup');
  const btnCloseMatchSetup = document.getElementById('btnCloseMatchSetup');
  const btnLaunchMatch = document.getElementById('btnLaunchMatch');
  const setupSummaryText = document.getElementById('setupSummaryText');
  const matchFormatBadge = document.getElementById('matchFormatBadge');
  const btnOpenSetupFromStats = document.getElementById('btnOpenSetupFromStats');
  const btnSoundToggle = document.getElementById('btnSoundToggle');
  const replaysCard = document.getElementById('replaysCard');
  const replaysBtnContainer = document.getElementById('replaysBtnContainer');
  const btnTacticalStats = document.getElementById('btnTacticalStats');
  const btnTacticalChat = document.getElementById('btnTacticalChat');

  // Streamlined In-Game Pause Menu & Floating Chat Elements
  const pauseMenuModal = document.getElementById('pauseMenuModal');
  const btnPauseGame = document.getElementById('btnPauseGame');
  const btnResumeGame = document.getElementById('btnResumeGame');
  const pauseMatchSummary = document.getElementById('pauseMatchSummary');
  const pauseSoundIcon = document.getElementById('pauseSoundIcon');
  const pauseSoundLabel = document.getElementById('pauseSoundLabel');

  const inGameChatModal = document.getElementById('inGameChatModal');
  const btnFloatingChat = document.getElementById('btnFloatingChat');
  const btnCloseInGameChat = document.getElementById('btnCloseInGameChat');
  const chatUnreadDot = document.getElementById('chatUnreadDot');

  // Team Buttons & Avatar Quick Edit
  const btnJoinRed = document.getElementById('btnJoinRed');
  const btnJoinSpec = document.getElementById('btnJoinSpec');
  const btnJoinBlue = document.getElementById('btnJoinBlue');
  const quickAvatarInput = document.getElementById('quickAvatarInput');
  const btnSaveAvatar = document.getElementById('btnSaveAvatar');

  // Roster Lists
  const listRed = document.getElementById('listRed');
  const listSpec = document.getElementById('listSpec');
  const listBlue = document.getElementById('listBlue');
  const countRed = document.getElementById('countRed');
  const countSpec = document.getElementById('countSpec');
  const countBlue = document.getElementById('countBlue');

  // Chat Elements
  const chatForm = document.getElementById('chatForm');
  const chatInput = document.getElementById('chatInput');
  const chatMessages = document.getElementById('chatMessages');

  let myId = null;
  let latestGameState = null;
  let currentProfile = null;
  let currentRank = null;
  let currentLeaderboard = [];
  let isJoinedGame = false;
  let myLastTeam = 'red';

  // LocalStorage Check on Launch
  let savedProfileName = localStorage.getItem('ballo_profile_name') || localStorage.getItem('haxball_profile_name');
  let savedProfileAvatar = localStorage.getItem('ballo_profile_avatar') || localStorage.getItem('haxball_profile_avatar') || '10';

  function initMenuProfileUI() {
    if (savedProfileName) {
      if (menuProfileNameText) menuProfileNameText.textContent = savedProfileName;
      if (menuAvatarPreview) menuAvatarPreview.textContent = savedProfileAvatar;
      if (nicknameInput) nicknameInput.value = savedProfileName;
      if (avatarInput) avatarInput.value = savedProfileAvatar;
      if (menuProfileForm) menuProfileForm.classList.add('hidden');
    } else {
      // First-time player: open inline name input
      if (menuProfileForm) menuProfileForm.classList.remove('hidden');
      if (nicknameInput) nicknameInput.focus();
    }
  }
  initMenuProfileUI();

  if (btnMenuEditProfile) {
    btnMenuEditProfile.addEventListener('click', () => {
      if (menuProfileForm) {
        menuProfileForm.classList.toggle('hidden');
        if (!menuProfileForm.classList.contains('hidden') && nicknameInput) {
          nicknameInput.focus();
        }
      }
    });
  }

  if (btnCancelMenuProfile) {
    btnCancelMenuProfile.addEventListener('click', () => {
      if (menuProfileForm) menuProfileForm.classList.add('hidden');
    });
  }

  if (menuProfileForm) {
    menuProfileForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const newName = (nicknameInput.value.trim() || 'Player').slice(0, 15);
      const newAvatar = (avatarInput.value.trim() || '10').slice(0, 3);
      savedProfileName = newName;
      savedProfileAvatar = newAvatar;
      localStorage.setItem('ballo_profile_name', newName);
      localStorage.setItem('ballo_profile_avatar', newAvatar);
      localStorage.setItem('haxball_profile_name', newName);
      localStorage.setItem('haxball_profile_avatar', newAvatar);

      if (menuProfileNameText) menuProfileNameText.textContent = newName;
      if (menuAvatarPreview) menuAvatarPreview.textContent = newAvatar;
      menuProfileForm.classList.add('hidden');

      if (isJoinedGame) {
        socket.emit('update_nickname', { name: newName });
        socket.emit('update_avatar', { avatar: newAvatar });
      }
    });
  }

  function getActiveProfile() {
    let name = (nicknameInput && nicknameInput.value.trim()) || savedProfileName || 'Player';
    let avatar = (avatarInput && avatarInput.value.trim()) || savedProfileAvatar || '10';
    name = name.slice(0, 15);
    avatar = avatar.slice(0, 3);
    localStorage.setItem('ballo_profile_name', name);
    localStorage.setItem('ballo_profile_avatar', avatar);
    localStorage.setItem('haxball_profile_name', name);
    localStorage.setItem('haxball_profile_avatar', avatar);
    return { name, avatar };
  }

  function enterGame(teamChoice = 'red') {
    const { name, avatar } = getActiveProfile();
    myLastTeam = teamChoice;

    if (!isJoinedGame) {
      socket.emit('join_game', { name, avatar, team: teamChoice });
      isJoinedGame = true;
    } else {
      socket.emit('switch_team', { team: teamChoice });
    }

    if (quickAvatarInput) quickAvatarInput.value = avatar;
    if (profileEditAvatarInput) profileEditAvatarInput.value = avatar;

    if (mainMenuModal) mainMenuModal.classList.add('hidden');

    if (window.soundManager) {
      window.soundManager.initContext();
      window.soundManager.stopBGM(true);
    }
  }

  // 4. Pre-Match Setup Logic (Kaça Kaç, Süre, Gol, Bot, Saha)
  let currentMatchSetup = {
    format: '1v1',
    team: 'red',
    duration: 180,
    scoreLimit: 3,
    difficulty: 'extreme',
    map: 'classic',
    weather: 'night',
    gameMode: 'classic',
    bombTimer: 20
  };

  // Restore saved match setup preferences from localStorage
  try {
    const savedSetup = localStorage.getItem('ballo_match_setup') || localStorage.getItem('haxball_match_setup');
    if (savedSetup) {
      currentMatchSetup = { ...currentMatchSetup, ...JSON.parse(savedSetup) };
    }
  } catch (e) {
    console.warn('Error reading saved setup', e);
  }

  function updateSetupUIFromState() {
    const syncGroup = (groupId, val) => {
      const group = document.getElementById(groupId);
      if (!group) return;
      const pills = group.querySelectorAll('.setup-pill');
      pills.forEach(p => {
        if (p.getAttribute('data-val') === String(val)) {
          p.classList.add('active');
        } else {
          p.classList.remove('active');
        }
      });
    };

    syncGroup('groupGameMode', currentMatchSetup.gameMode || 'classic');
    syncGroup('groupMatchFormat', currentMatchSetup.format);
    syncGroup('groupTeamSelect', currentMatchSetup.team);
    syncGroup('groupMatchDuration', currentMatchSetup.duration);
    syncGroup('groupBombDuration', currentMatchSetup.bombTimer || 20);
    syncGroup('groupScoreLimit', currentMatchSetup.scoreLimit);
    syncGroup('groupBotDifficulty', currentMatchSetup.difficulty);
    syncGroup('groupStadiumMap', currentMatchSetup.map);
    syncGroup('groupStadiumWeather', currentMatchSetup.weather);

    // Toggle bomb mode duration vs classic match duration & goal limit
    const isBomb = (currentMatchSetup.gameMode === 'bomb');
    const sectionMatchDuration = document.getElementById('sectionMatchDuration');
    const sectionBombDuration = document.getElementById('sectionBombDuration');
    const sectionScoreLimit = document.getElementById('sectionScoreLimit');
    const matchParamsGrid = document.getElementById('matchParamsGrid');

    if (sectionMatchDuration) sectionMatchDuration.classList.toggle('hidden', isBomb);
    if (sectionScoreLimit) sectionScoreLimit.classList.toggle('hidden', isBomb);
    if (sectionBombDuration) sectionBombDuration.classList.toggle('hidden', !isBomb);
    if (matchParamsGrid) matchParamsGrid.classList.toggle('bomb-mode-active', isBomb);

    updateMatchSetupSummary();
  }

  function updateMatchSetupSummary() {
    const formatNames = { '1v1': '1v1 Teke Tek', '2v2': '2v2 Takım', '3v3': '3v3 Klasik', '4v4': '4v4 Büyük Maç' };
    const durNames = { 60: '1 Dk', 120: '2 Dk', 180: '3 Dk', 300: '5 Dk', 420: '7 Dk', 0: 'Süresiz ♾️' };
    const goalNames = { 3: 'İlk 3 Gol', 5: 'İlk 5 Gol', 7: 'İlk 7 Gol', 10: 'İlk 10 Gol', 0: 'Limitsiz ⚽' };
    const diffNames = { easy: 'Kolay', medium: 'Orta', hard: 'Zor', extreme: 'Pro' };
    const mapNames = { classic: 'Classic Saha', big: 'Big Arena', futsal: 'Futsal', hockey: 'Buz Pisti', street: 'Sokak Sahası', custom: '🛠️ Özel Saham' };
    const teamNames = { red: '🔴 Kırmızı Takım', blue: '🔵 Mavi Takım' };

    const isBomb = (currentMatchSetup.gameMode === 'bomb');
    const modeStr = isBomb ? '💣 Bomba Topu' : '⚽ Futbol';
    const fmtStr = formatNames[currentMatchSetup.format] || currentMatchSetup.format;
    const durStr = durNames[currentMatchSetup.duration] || (currentMatchSetup.duration + 's');
    const goalStr = goalNames[currentMatchSetup.scoreLimit] || 'Limitsiz';
    const diffStr = diffNames[currentMatchSetup.difficulty] || 'Pro';
    const mapStr = mapNames[currentMatchSetup.map] || 'Classic';
    const teamStr = teamNames[currentMatchSetup.team] || 'Kırmızı';
    const bombTimerSec = currentMatchSetup.bombTimer || 20;

    if (setupSummaryText) {
      if (isBomb) {
        setupSummaryText.textContent = `${modeStr} • ⚡ ${fmtStr} • 💣 Sayaç: ${bombTimerSec} Sn • ${diffStr} Bot • ${mapStr} • ${teamStr}`;
      } else {
        setupSummaryText.textContent = `${modeStr} • ⚡ ${fmtStr} • ${durStr} • ${goalStr} • ${diffStr} Bot • ${mapStr} • ${teamStr}`;
      }
    }

    if (matchFormatBadge) {
      if (isBomb) {
        matchFormatBadge.textContent = `${currentMatchSetup.format} • ${bombTimerSec} Sn`;
      } else {
        matchFormatBadge.textContent = `${currentMatchSetup.format} • ${durStr}`;
      }
    }
  }

  function initMatchSetupPills() {
    const setupGroupKeys = [
      { id: 'groupGameMode', key: 'gameMode', isNum: false },
      { id: 'groupMatchFormat', key: 'format', isNum: false },
      { id: 'groupTeamSelect', key: 'team', isNum: false },
      { id: 'groupMatchDuration', key: 'duration', isNum: true },
      { id: 'groupBombDuration', key: 'bombTimer', isNum: true },
      { id: 'groupScoreLimit', key: 'scoreLimit', isNum: true },
      { id: 'groupBotDifficulty', key: 'difficulty', isNum: false },
      { id: 'groupStadiumMap', key: 'map', isNum: false },
      { id: 'groupStadiumWeather', key: 'weather', isNum: false }
    ];

    setupGroupKeys.forEach(({ id, key, isNum }) => {
      const container = document.getElementById(id);
      if (!container) return;
      const pills = container.querySelectorAll('.setup-pill');
      pills.forEach(pill => {
        pill.addEventListener('click', () => {
          pills.forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
          const rawVal = pill.getAttribute('data-val');
          currentMatchSetup[key] = isNum ? Number(rawVal) : rawVal;

          if (key === 'gameMode') {
            const isBomb = (rawVal === 'bomb');
            const sectionMatchDuration = document.getElementById('sectionMatchDuration');
            const sectionBombDuration = document.getElementById('sectionBombDuration');
            const sectionScoreLimit = document.getElementById('sectionScoreLimit');
            const matchParamsGrid = document.getElementById('matchParamsGrid');

            if (sectionMatchDuration) sectionMatchDuration.classList.toggle('hidden', isBomb);
            if (sectionScoreLimit) sectionScoreLimit.classList.toggle('hidden', isBomb);
            if (sectionBombDuration) sectionBombDuration.classList.toggle('hidden', !isBomb);
            if (matchParamsGrid) matchParamsGrid.classList.toggle('bomb-mode-active', isBomb);
          }

          updateMatchSetupSummary();
          try {
            localStorage.setItem('ballo_match_setup', JSON.stringify(currentMatchSetup));
            localStorage.setItem('haxball_match_setup', JSON.stringify(currentMatchSetup));
          } catch (e) {}
        });
      });
    });
  }
  initMatchSetupPills();

  function openMatchSetupModal() {
    closePauseMenu();
    updateSetupUIFromState();
    if (mainMenuModal) mainMenuModal.classList.add('hidden');
    if (matchSetupModal) matchSetupModal.classList.remove('hidden');
  }

  function launchConfiguredMatch() {
    enterGame(currentMatchSetup.team);
    const payload = { ...currentMatchSetup };
    if (currentMatchSetup.map === 'custom') {
      payload.customStadium = customStadium;
    }
    socket.emit('setup_and_start_match', payload);
    if (renderer) renderer.setWeather(currentMatchSetup.weather);
    if (matchSetupModal) matchSetupModal.classList.add('hidden');
    if (mainMenuModal) mainMenuModal.classList.add('hidden');
    if (statsModal) statsModal.classList.add('hidden');
    if (gameOverBanner) gameOverBanner.classList.add('hidden');
    updateMatchSetupSummary();
  }

  // "Hemen Oyna" -> Anında maça başla!
  if (btnPlaySolo) {
    btnPlaySolo.addEventListener('click', () => {
      launchConfiguredMatch();
    });
  }

  // "Sahaya Gir / Maç Ayarla" -> Maç Öncesi Ayarlar Penceresini Aç (1v1, 2v2, 3v3, 4v4 vs)
  if (btnEnterLobby) {
    btnEnterLobby.addEventListener('click', () => {
      openMatchSetupModal();
    });
  }

  // Header "⚙️ Maç Kur" butonu
  if (btnOpenMatchSetup) {
    btnOpenMatchSetup.addEventListener('click', openMatchSetupModal);
  }

  // Ayarlar Penceresi Kapat
  if (btnCloseMatchSetup) {
    btnCloseMatchSetup.addEventListener('click', () => {
      if (matchSetupModal) matchSetupModal.classList.add('hidden');
      if (!latestGameState || latestGameState.state === 'WAITING' || latestGameState.state === 'GAME_OVER') {
        if (mainMenuModal) {
          mainMenuModal.classList.remove('hidden');
          if (window.soundManager) window.soundManager.playBGM(true);
        }
      }
    });
  }

  // Ayarlar Penceresindeki "MAÇI BAŞLAT" butonu
  if (btnLaunchMatch) {
    btnLaunchMatch.addEventListener('click', () => {
      launchConfiguredMatch();
    });
  }

  if (btnOpenSetupFromStats) {
    btnOpenSetupFromStats.addEventListener('click', () => {
      if (statsModal) statsModal.classList.add('hidden');
      openMatchSetupModal();
    });
  }

  // Initial UI sync
  updateSetupUIFromState();

  // Header "🏠 Menü" -> Return to main menu overlay
  if (btnReturnToMenu) {
    btnReturnToMenu.addEventListener('click', () => {
      closePauseMenu();
      if (mainMenuModal) {
        mainMenuModal.classList.remove('hidden');
        if (window.soundManager) window.soundManager.playBGM(true);
      }
    });
  }

  // Menu Secondary Action Buttons
  if (btnMenuLeaderboard) {
    btnMenuLeaderboard.addEventListener('click', () => {
      openLeaderboard();
    });
  }

  if (btnMenuProfile) {
    btnMenuProfile.addEventListener('click', () => {
      if (profileModal) profileModal.classList.remove('hidden');
    });
  }

  if (btnMenuHowToPlay) {
    btnMenuHowToPlay.addEventListener('click', () => {
      if (howToPlayBox) howToPlayBox.classList.toggle('hidden');
    });
  }

  if (btnCloseHowToPlay) {
    btnCloseHowToPlay.addEventListener('click', () => {
      if (howToPlayBox) howToPlayBox.classList.add('hidden');
    });
  }

  // Tournament Manager instance
  let tournamentManager = null;
  if (window.TournamentManager) {
    tournamentManager = new TournamentManager(socket, (team) => enterGame(team));
  }

  // Training Manager instance
  let trainingManager = null;
  if (window.TrainingManager) {
    trainingManager = new TrainingManager(socket, renderer, (team) => enterGame(team));
  }

  // Cosmetics & Titles Elements
  const auraOptionsGrid = document.getElementById('auraOptionsGrid');
  const selectPlayerTitle = document.getElementById('selectPlayerTitle');

  if (auraOptionsGrid) {
    auraOptionsGrid.querySelectorAll('.cosmetic-option').forEach(opt => {
      opt.addEventListener('click', () => {
        if (opt.classList.contains('locked')) return;
        auraOptionsGrid.querySelectorAll('.cosmetic-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');

        const aura = opt.getAttribute('data-aura');
        const title = selectPlayerTitle ? selectPlayerTitle.value : null;
        socket.emit('update_cosmetics', { aura, title });
      });
    });
  }

  if (selectPlayerTitle) {
    selectPlayerTitle.addEventListener('change', () => {
      const selectedOpt = auraOptionsGrid ? auraOptionsGrid.querySelector('.cosmetic-option.selected') : null;
      const aura = selectedOpt ? selectedOpt.getAttribute('data-aura') : 'none';
      const title = selectPlayerTitle.value;
      socket.emit('update_cosmetics', { aura, title });
    });
  }

  // Multi-Room Lobby Elements
  const roomModal = document.getElementById('roomModal');
  const btnOpenRoomLobby = document.getElementById('btnOpenRoomLobby');
  const btnCloseRoomModal = document.getElementById('btnCloseRoomModal');
  const btnRefreshRoomList = document.getElementById('btnRefreshRoomList');
  const btnSubmitCreateRoom = document.getElementById('btnSubmitCreateRoom');
  const createRoomNameInput = document.getElementById('createRoomNameInput');
  const createRoomPassInput = document.getElementById('createRoomPassInput');
  const createRoomPresetSelect = document.getElementById('createRoomPresetSelect');
  const createRoomFormatSelect = document.getElementById('createRoomFormatSelect');
  const createRoomModeSelect = document.getElementById('createRoomModeSelect');
  const createRoomDurationSelect = document.getElementById('createRoomDurationSelect');
  const createRoomScoreSelect = document.getElementById('createRoomScoreSelect');
  const createRoomBombSelect = document.getElementById('createRoomBombSelect');
  const createRoomBombRow = document.getElementById('createRoomBombRow');
  const createRoomBotSelect = document.getElementById('createRoomBotSelect');
  const createRoomAutofillCheck = document.getElementById('createRoomAutofillCheck');
  const roomListTbody = document.getElementById('roomListTbody');

  // Bomba modu seçilince patlama süresi satırını göster
  if (createRoomModeSelect && createRoomBombRow) {
    const syncBombRow = () => {
      createRoomBombRow.style.display = (createRoomModeSelect.value === 'bomb') ? '' : 'none';
    };
    createRoomModeSelect.addEventListener('change', syncBombRow);
    syncBombRow();
  }

  if (btnOpenRoomLobby) {
    btnOpenRoomLobby.addEventListener('click', () => {
      socket.emit('get_room_list');
      if (roomModal) roomModal.classList.remove('hidden');
    });
  }

  if (btnCloseRoomModal) {
    btnCloseRoomModal.addEventListener('click', () => {
      if (roomModal) roomModal.classList.add('hidden');
    });
  }

  if (btnRefreshRoomList) {
    btnRefreshRoomList.addEventListener('click', () => {
      socket.emit('get_room_list');
    });
  }

  if (btnSubmitCreateRoom) {
    btnSubmitCreateRoom.addEventListener('click', () => {
      const name = (createRoomNameInput && createRoomNameInput.value.trim()) || 'Özel Oda';
      const password = (createRoomPassInput && createRoomPassInput.value.trim()) || null;
      const preset = (createRoomPresetSelect && createRoomPresetSelect.value) || 'classic';
      const format = (createRoomFormatSelect && createRoomFormatSelect.value) || '1v1';
      const gameMode = (createRoomModeSelect && createRoomModeSelect.value) || 'classic';
      const duration = createRoomDurationSelect ? Number(createRoomDurationSelect.value) : 180;
      const scoreLimit = createRoomScoreSelect ? Number(createRoomScoreSelect.value) : 3;
      const bombTimer = createRoomBombSelect ? Number(createRoomBombSelect.value) : 20;
      const difficulty = (createRoomBotSelect && createRoomBotSelect.value) || 'extreme';
      const autoFillBots = !createRoomAutofillCheck || createRoomAutofillCheck.checked;

      const roomId = `room_${Math.floor(1000 + Math.random() * 9000)}`;
      socket.emit('create_room', { roomId, name, password, preset, format, gameMode, duration, scoreLimit, bombTimer, difficulty, autoFillBots });
      socket.emit('switch_room', { roomId, password });

      enterGame('spec');
      if (roomModal) roomModal.classList.add('hidden');
    });
  }

  // Oda kurulunca seçilen özellikleri maç ayarlarına yansıt (Rövanş/Maç Ayarla aynı kuralla açılır)
  socket.on('room_created', (data) => {
    if (data && data.config) {
      const cfg = data.config;
      if (cfg.format) currentMatchSetup.format = cfg.format;
      if (cfg.gameMode) currentMatchSetup.gameMode = cfg.gameMode;
      if (typeof cfg.duration === 'number') currentMatchSetup.duration = cfg.duration;
      if (typeof cfg.scoreLimit === 'number') currentMatchSetup.scoreLimit = cfg.scoreLimit;
      if (cfg.difficulty) currentMatchSetup.difficulty = cfg.difficulty;
      if (typeof cfg.bombTimer === 'number') currentMatchSetup.bombTimer = cfg.bombTimer;
      if (data.preset) currentMatchSetup.map = data.preset;
      try {
        localStorage.setItem('ballo_match_setup', JSON.stringify(currentMatchSetup));
        localStorage.setItem('haxball_match_setup', JSON.stringify(currentMatchSetup));
      } catch (e) {}
      updateSetupUIFromState();
    }
  });

  function renderRoomList(rooms) {
    if (!roomListTbody) return;
    roomListTbody.innerHTML = '';
    if (!rooms || rooms.length === 0) {
      roomListTbody.innerHTML = '<tr><td colspan="5" class="empty-table-msg">Aktif oda bulunamadı. Hemen yeni bir oda kur!</td></tr>';
      return;
    }

    rooms.forEach(r => {
      const tr = document.createElement('tr');
      const passTag = r.hasPassword ? ' 🔒' : '';
      const modeTag = r.gameMode === 'bomb' ? ' 💣' : '';
      const formatTag = r.format ? ` <span style="opacity: 0.7; font-size: 10px;">(${escapeHtml(r.format)})</span>` : '';
      tr.innerHTML = `
        <td><b>${escapeHtml(r.name)}</b>${passTag}</td>
        <td>${escapeHtml(r.stadium)}${modeTag}${formatTag}</td>
        <td><span class="red-text">${r.scoreRed}</span> - <span class="blue-text">${r.scoreBlue}</span> (${r.state})</td>
        <td>👥 ${r.playersCount}</td>
        <td><button class="btn-join-room" data-room-id="${r.id}" data-has-pass="${r.hasPassword}">Katıl</button></td>
      `;
      roomListTbody.appendChild(tr);
    });

    // Add click listeners to join buttons (prompt yok, özel şifre modalı var)
    roomListTbody.querySelectorAll('.btn-join-room').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const rId = e.currentTarget.getAttribute('data-room-id');
        const hasPass = e.currentTarget.getAttribute('data-has-pass') === 'true';
        if (hasPass) {
          openRoomPasswordModal(rId);
        } else {
          socket.emit('switch_room', { roomId: rId });
          enterGame('spec');
          if (roomModal) roomModal.classList.add('hidden');
        }
      });
    });
  }

  // --- Oda şifre modalı (prompt yerine) ---
  let pendingPasswordRoomId = null;
  const roomPasswordModal = document.getElementById('roomPasswordModal');
  const roomPasswordForm = document.getElementById('roomPasswordForm');
  const roomPasswordInput = document.getElementById('roomPasswordInput');
  const roomPasswordError = document.getElementById('roomPasswordError');
  const roomPasswordDesc = document.getElementById('roomPasswordModalDesc');
  const btnCloseRoomPassword = document.getElementById('btnCloseRoomPassword');

  function openRoomPasswordModal(roomId, roomName) {
    pendingPasswordRoomId = roomId;
    if (roomPasswordDesc) {
      roomPasswordDesc.textContent = roomName
        ? `"${roomName}" şifreli. Katılmak için şifreyi girin.`
        : 'Bu odaya katılmak için şifreyi girin';
    }
    if (roomPasswordError) {
      roomPasswordError.textContent = '';
      roomPasswordError.classList.add('hidden');
    }
    if (roomPasswordInput) roomPasswordInput.value = '';
    if (roomPasswordModal) roomPasswordModal.classList.remove('hidden');
    if (roomModal) roomPasswordModal.style.zIndex = '1001';
    setTimeout(() => { if (roomPasswordInput) roomPasswordInput.focus(); }, 60);
  }

  function closeRoomPasswordModal() {
    pendingPasswordRoomId = null;
    if (roomPasswordModal) roomPasswordModal.classList.add('hidden');
    if (roomPasswordInput) roomPasswordInput.blur();
  }

  if (roomPasswordForm) {
    roomPasswordForm.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const pw = roomPasswordInput ? roomPasswordInput.value : '';
      if (!pendingPasswordRoomId) {
        closeRoomPasswordModal();
        return;
      }
      socket.emit('switch_room', { roomId: pendingPasswordRoomId, password: pw });
      enterGame('spec');
      if (roomModal) roomModal.classList.add('hidden');
      // Hatalıysa server room_password_required döner, modal açık kalır
    });
  }

  if (btnCloseRoomPassword) {
    btnCloseRoomPassword.addEventListener('click', closeRoomPasswordModal);
  }

  if (roomPasswordModal) {
    roomPasswordModal.addEventListener('click', (ev) => {
      if (ev.target === roomPasswordModal) closeRoomPasswordModal();
    });
  }

  socket.on('room_list_update', (rooms) => {
    renderRoomList(rooms);
  });

  socket.on('room_password_required', (data) => {
    // Şifre hatalı/eksik: modalı aç ve hatayı göster (prompt yok)
    openRoomPasswordModal(data && data.roomId, data && data.name);
    if (roomPasswordError) {
      roomPasswordError.textContent = 'Oda şifresi hatalı veya eksik. Tekrar deneyin.';
      roomPasswordError.classList.remove('hidden');
    }
  });

  socket.on('room_error', (data) => {
    const msg = data && data.message ? data.message : 'Oda hatası!';
    // Şifre hatası zaten modalda gösteriliyor, gereksiz alert basma
    if (pendingPasswordRoomId && /şifre/i.test(msg)) {
      if (roomPasswordError) {
        roomPasswordError.textContent = msg;
        roomPasswordError.classList.remove('hidden');
      }
      return;
    }
    alert(msg);
  });

  // URL Query auto-join (?room=1234)
  const urlParams = new URLSearchParams(window.location.search);
  const autoRoomParam = urlParams.get('room');
  if (autoRoomParam) {
    setTimeout(() => {
      socket.emit('switch_room', { roomId: autoRoomParam });
    }, 400);
  }

  // 2. Team Switch Handlers
  if (btnJoinRed) btnJoinRed.addEventListener('click', () => { myLastTeam = 'red'; socket.emit('switch_team', { team: 'red' }); });
  if (btnJoinSpec) btnJoinSpec.addEventListener('click', () => { myLastTeam = 'spec'; socket.emit('switch_team', { team: 'spec' }); });
  if (btnJoinBlue) btnJoinBlue.addEventListener('click', () => { myLastTeam = 'blue'; socket.emit('switch_team', { team: 'blue' }); });

  // 3. Avatar Quick Edit
  if (btnSaveAvatar) {
    btnSaveAvatar.addEventListener('click', () => {
      if (quickAvatarInput) {
        const avatar = quickAvatarInput.value.trim();
        if (avatar) {
          socket.emit('update_avatar', { avatar });
        }
      }
    });
  }

  // 6. Sound Toggle (Menu + In-Game Pause Menu)
  function updateSoundUI(isEnabled) {
    const icon = isEnabled ? '🔊' : '🔇';
    if (btnSoundToggle) btnSoundToggle.textContent = icon;
    if (btnMenuSoundToggle) btnMenuSoundToggle.textContent = icon;
    if (btnNowPlayingMute) btnNowPlayingMute.textContent = icon;
    if (pauseSoundIcon) pauseSoundIcon.textContent = icon;
    if (pauseSoundLabel) pauseSoundLabel.textContent = isEnabled ? 'Ses: Açık' : 'Ses: Kapalı';
    if (btnSoundToggle) btnSoundToggle.title = isEnabled ? 'Sesi Kapat' : 'Sesi Aç';
    if (btnMenuSoundToggle) btnMenuSoundToggle.title = isEnabled ? 'Sesi Kapat' : 'Sesi Aç';
    if (btnNowPlayingMute) btnNowPlayingMute.title = isEnabled ? 'Müziği Kapat' : 'Müziği Aç';

    if (menuNowPlaying) {
      if (isEnabled) {
        menuNowPlaying.classList.remove('muted');
        if (nowPlayingTitle) nowPlayingTitle.textContent = 'Aylex - This Is Phonk';
      } else {
        menuNowPlaying.classList.add('muted');
        if (nowPlayingTitle) nowPlayingTitle.textContent = 'Müzik Kapalı (Sessiz)';
      }
    }
  }

  if (btnSoundToggle) {
    btnSoundToggle.addEventListener('click', () => {
      if (window.soundManager) {
        const isEnabled = window.soundManager.toggleSound();
        updateSoundUI(isEnabled);
      }
    });
  }

  if (btnMenuSoundToggle) {
    btnMenuSoundToggle.addEventListener('click', () => {
      if (window.soundManager) {
        const isEnabled = window.soundManager.toggleSound();
        updateSoundUI(isEnabled);
      }
    });
  }

  if (btnNowPlayingMute) {
    btnNowPlayingMute.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.soundManager) {
        const isEnabled = window.soundManager.toggleSound();
        updateSoundUI(isEnabled);
      }
    });
  }

  // 6b. Mobile Fullscreen Toggle & Landscape Orientation Lock
  const btnFullscreen = document.getElementById('btnFullscreen');
  if (btnFullscreen) {
    btnFullscreen.addEventListener('click', async () => {
      try {
        if (!document.fullscreenElement) {
          if (document.documentElement.requestFullscreen) {
            await document.documentElement.requestFullscreen();
          } else if (document.documentElement.webkitRequestFullscreen) {
            await document.documentElement.webkitRequestFullscreen();
          }
          if (screen.orientation && screen.orientation.lock) {
            try { await screen.orientation.lock('landscape'); } catch (err) {}
          }
          btnFullscreen.textContent = '🗗';
          btnFullscreen.title = 'Tam Ekrandan Çık';
        } else {
          if (document.exitFullscreen) {
            await document.exitFullscreen();
          } else if (document.webkitExitFullscreen) {
            await document.webkitExitFullscreen();
          }
          btnFullscreen.textContent = '⛶';
          btnFullscreen.title = 'Tam Ekran (Landscape)';
        }
      } catch (e) {
        console.warn('Fullscreen toggle failed:', e);
      }
    });

    document.addEventListener('fullscreenchange', () => {
      const isFull = !!document.fullscreenElement;
      btnFullscreen.textContent = isFull ? '🗗' : '⛶';
      btnFullscreen.title = isFull ? 'Tam Ekrandan Çık' : 'Tam Ekran (Landscape)';
    });
  }

  // 6c. Mobile Portrait Warning Dismiss Button
  const btnDismissRotate = document.getElementById('btnDismissRotate');
  if (btnDismissRotate) {
    btnDismissRotate.addEventListener('click', () => {
      document.body.classList.add('dismissed-rotate');
    });
  }

  // 6d. In-Game Pause Menu Logic
  function openPauseMenu() {
    if (!pauseMenuModal) return;
    if (inGameChatModal) inGameChatModal.classList.add('hidden');
    if (pauseMatchSummary && latestGameState) {
      const red = latestGameState.scores ? latestGameState.scores.red : 0;
      const blue = latestGameState.scores ? latestGameState.scores.blue : 0;
      const mins = Math.floor((latestGameState.timeElapsed || 0) / 60);
      const secs = (latestGameState.timeElapsed || 0) % 60;
      const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      const fmt = (latestGameState.matchConfig && latestGameState.matchConfig.format) || '1v1';
      pauseMatchSummary.textContent = `${fmt} • RED ${red} - ${blue} BLUE • ${timeStr}`;
    }
    pauseMenuModal.classList.remove('hidden');
    if (inputManager && inputManager.reset) {
      inputManager.reset();
    }
    socket.emit('toggle_pause', { isPaused: true });
  }

  function closePauseMenu() {
    if (pauseMenuModal) pauseMenuModal.classList.add('hidden');
    socket.emit('toggle_pause', { isPaused: false });
  }

  // 6e. In-Game Floating Chat Logic
  function openInGameChat() {
    if (!inGameChatModal) return;
    if (pauseMenuModal) pauseMenuModal.classList.add('hidden');
    inGameChatModal.classList.remove('hidden');
    if (chatUnreadDot) chatUnreadDot.classList.add('hidden');
    if (chatInput) {
      setTimeout(() => chatInput.focus(), 60);
    }
  }

  function closeInGameChat() {
    if (inGameChatModal) inGameChatModal.classList.add('hidden');
    if (chatInput) chatInput.blur();
  }

  if (btnPauseGame) {
    btnPauseGame.addEventListener('click', () => {
      if (pauseMenuModal && !pauseMenuModal.classList.contains('hidden')) {
        closePauseMenu();
      } else {
        openPauseMenu();
      }
    });
  }

  if (btnResumeGame) {
    btnResumeGame.addEventListener('click', closePauseMenu);
  }

  if (btnFloatingChat) {
    btnFloatingChat.addEventListener('click', () => {
      if (inGameChatModal && !inGameChatModal.classList.contains('hidden')) {
        closeInGameChat();
      } else {
        openInGameChat();
      }
    });
  }

  if (btnCloseInGameChat) {
    btnCloseInGameChat.addEventListener('click', closeInGameChat);
  }

  // Dismiss modals on backdrop tap
  if (pauseMenuModal) {
    pauseMenuModal.addEventListener('click', (e) => {
      if (e.target === pauseMenuModal) closePauseMenu();
    });
  }

  if (inGameChatModal) {
    inGameChatModal.addEventListener('click', (e) => {
      if (e.target === inGameChatModal) closeInGameChat();
    });
  }

  // Global toggle hooks for InputManager (Escape / Enter keys)
  window.toggleInGamePause = () => {
    if (inGameChatModal && !inGameChatModal.classList.contains('hidden')) {
      closeInGameChat();
      return;
    }
    if (pauseMenuModal && !pauseMenuModal.classList.contains('hidden')) {
      closePauseMenu();
    } else {
      openPauseMenu();
    }
  };

  window.toggleInGameChat = () => {
    if (inGameChatModal && !inGameChatModal.classList.contains('hidden')) {
      closeInGameChat();
    } else {
      openInGameChat();
    }
  };

  // 7. Chat Submission
  if (chatForm) {
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = chatInput.value.trim();
      if (text) {
        socket.emit('send_chat', { message: text });
        chatInput.value = '';
      }
      // On mobile keep focus or blur depending on user
      chatInput.focus();
    });
  }

  // 8. Stats Modal Actions
  if (btnCloseStats) {
    btnCloseStats.addEventListener('click', () => {
      statsModal.classList.add('hidden');
    });
  }

  if (btnTacticalStats) {
    btnTacticalStats.addEventListener('click', () => {
      if (statsModal) {
        statsModal.classList.toggle('hidden');
      }
    });
  }

  if (btnStartNewMatch) {
    btnStartNewMatch.addEventListener('click', () => {
      socket.emit('restart_match');
      statsModal.classList.add('hidden');
      gameOverBanner.classList.add('hidden');
    });
  }

  if (btnRestartMatch) {
    btnRestartMatch.addEventListener('click', () => {
      closePauseMenu();
      socket.emit('restart_match');
      statsModal.classList.add('hidden');
      gameOverBanner.classList.add('hidden');
    });
  }

  // 8b. Profile & Leaderboard Modal Controls
  if (btnOpenProfile) {
    btnOpenProfile.addEventListener('click', () => {
      closePauseMenu();
      if (profileModal) profileModal.classList.remove('hidden');
    });
  }

  if (btnCloseProfile) {
    btnCloseProfile.addEventListener('click', () => {
      if (profileModal) profileModal.classList.add('hidden');
    });
  }

  if (btnChangeProfile) {
    btnChangeProfile.addEventListener('click', () => {
      if (profileModal) profileModal.classList.add('hidden');
      if (mainMenuModal) {
        mainMenuModal.classList.remove('hidden');
        if (menuProfileForm) menuProfileForm.classList.remove('hidden');
        if (nicknameInput) {
          nicknameInput.focus();
        }
      }
    });
  }

  if (btnProfileSaveAvatar) {
    btnProfileSaveAvatar.addEventListener('click', () => {
      if (profileEditAvatarInput) {
        const newAvatar = profileEditAvatarInput.value.trim();
        if (newAvatar) {
          socket.emit('update_avatar', { avatar: newAvatar });
          localStorage.setItem('ballo_profile_avatar', newAvatar);
          localStorage.setItem('haxball_profile_avatar', newAvatar);
          if (quickAvatarInput) quickAvatarInput.value = newAvatar;
          if (menuAvatarPreview) menuAvatarPreview.textContent = newAvatar;
        }
      }
    });
  }

  if (btnProfileViewLeaderboard) {
    btnProfileViewLeaderboard.addEventListener('click', () => {
      if (profileModal) profileModal.classList.add('hidden');
      openLeaderboard();
    });
  }

  if (btnOpenLeaderboard) {
    btnOpenLeaderboard.addEventListener('click', openLeaderboard);
  }

  if (btnOpenLeaderboardFromStats) {
    btnOpenLeaderboardFromStats.addEventListener('click', openLeaderboard);
  }

  if (btnCloseLeaderboard) {
    btnCloseLeaderboard.addEventListener('click', () => {
      if (leaderboardModal) leaderboardModal.classList.add('hidden');
    });
  }

  function openLeaderboard() {
    closePauseMenu();
    socket.emit('get_leaderboard');
    if (leaderboardModal) leaderboardModal.classList.remove('hidden');
  }

  function updateProfileUI(profile, rank) {
    if (!profile) return;
    currentProfile = profile;
    currentRank = rank;

    if (headerProfileName) headerProfileName.textContent = profile.name;
    if (headerProfileGoals) headerProfileGoals.textContent = `${profile.goals} ⚽`;

    if (menuProfileNameText) menuProfileNameText.textContent = profile.name;
    if (menuAvatarPreview) menuAvatarPreview.textContent = profile.avatar || '10';
    if (menuProfileStatsText) {
      menuProfileStatsText.textContent = `⚽ ${profile.goals} Gol | 🏟️ ${profile.matches} Maç | 🏆 ${profile.wins} Galibiyet`;
    }

    if (profileModalAvatar) profileModalAvatar.textContent = profile.avatar || '10';
    if (profileModalName) profileModalName.textContent = profile.name;
    if (profileModalRankBadge) {
      if (rank) {
        const medal = rank === 1 ? '🥇' : (rank === 2 ? '🥈' : (rank === 3 ? '🥉' : '👑'));
        profileModalRankBadge.textContent = `${medal} Gol Krallığı: ${rank}. Sırada`;
      } else {
        profileModalRankBadge.textContent = '👑 Gol Krallığı: Henüz Sıralama Yok';
      }
    }

    if (profStatGoals) profStatGoals.textContent = profile.goals;
    if (profStatMatches) profStatMatches.textContent = profile.matches;
    if (profStatWins) profStatWins.textContent = profile.wins;
    if (profStatAvg) {
      profStatAvg.textContent = profile.matches > 0
        ? (profile.goals / profile.matches).toFixed(2)
        : (profile.goals > 0 ? profile.goals.toFixed(2) : '0.00');
    }
    if (profileEditAvatarInput) profileEditAvatarInput.value = profile.avatar || '';

    // Update Cosmetic Aura Locks & Selected State
    if (auraOptionsGrid) {
      auraOptionsGrid.querySelectorAll('.cosmetic-option').forEach(opt => {
        const minGoals = parseInt(opt.getAttribute('data-min-goals'), 10) || 0;
        const optAura = opt.getAttribute('data-aura');
        if (profile.goals >= minGoals) {
          opt.classList.remove('locked');
        } else {
          opt.classList.add('locked');
        }

        if (profile.aura === optAura) {
          opt.classList.add('selected');
        } else {
          opt.classList.remove('selected');
        }
      });
    }

    if (selectPlayerTitle && profile.title) {
      selectPlayerTitle.value = profile.title;
    }
  }

  function renderLeaderboard(leaderboard) {
    if (!leaderboard) return;
    currentLeaderboard = leaderboard;

    // Top 3 Podium Cards
    const p1 = leaderboard[0] || null;
    const p2 = leaderboard[1] || null;
    const p3 = leaderboard[2] || null;

    const setPodium = (avElem, nameElem, goalsElem, pData) => {
      if (avElem) avElem.textContent = pData ? pData.avatar : '-';
      if (nameElem) nameElem.textContent = pData ? pData.name : '-';
      if (goalsElem) goalsElem.textContent = pData ? `${pData.goals} ⚽` : '0 ⚽';
    };

    setPodium(document.getElementById('podium1Avatar'), document.getElementById('podium1Name'), document.getElementById('podium1Goals'), p1);
    setPodium(document.getElementById('podium2Avatar'), document.getElementById('podium2Name'), document.getElementById('podium2Goals'), p2);
    setPodium(document.getElementById('podium3Avatar'), document.getElementById('podium3Name'), document.getElementById('podium3Goals'), p3);

    // Populate Table Body
    if (leaderboardTbody) {
      leaderboardTbody.innerHTML = '';
      if (leaderboard.length === 0) {
        leaderboardTbody.innerHTML = '<tr><td colspan="7" class="empty-table-msg">Henüz gol atılmadı! Sahaya çık ve ilk golü at! 👑</td></tr>';
      } else {
        leaderboard.forEach((item) => {
          const tr = document.createElement('tr');
          const isMe = currentProfile && item.name.toLowerCase() === currentProfile.name.toLowerCase();
          if (isMe) {
            tr.classList.add('my-leaderboard-row');
          }

          const rankBadge = item.rank === 1 ? '🥇 1' :
                           (item.rank === 2 ? '🥈 2' :
                           (item.rank === 3 ? '🥉 3' : `#${item.rank}`));

          tr.innerHTML = `
            <td class="rank-col font-bold">${rankBadge}</td>
            <td class="player-col font-bold">${item.name} ${isMe ? '<span class="you-badge">(Sen)</span>' : ''}</td>
            <td class="avatar-col"><span class="table-avatar-badge">${item.avatar}</span></td>
            <td class="goals-col font-bold gold-text">${item.goals} ⚽</td>
            <td class="matches-col">${item.matches}</td>
            <td class="wins-col">${item.wins}</td>
            <td class="avg-col">${item.goalsPerMatch}</td>
          `;
          leaderboardTbody.appendChild(tr);
        });
      }
    }

    // Update My Rank Indicator
    if (myRankText) {
      if (currentProfile) {
        const myEntry = leaderboard.find(x => x.name.toLowerCase() === currentProfile.name.toLowerCase());
        if (myEntry) {
          const medal = myEntry.rank === 1 ? '🥇' : (myEntry.rank === 2 ? '🥈' : (myEntry.rank === 3 ? '🥉' : '👑'));
          myRankText.innerHTML = `${medal} <span class="gold-text font-bold">#${myEntry.rank}. Sıra</span> (${myEntry.goals} Gol, ${myEntry.matches} Maç)`;
        } else {
          myRankText.textContent = `${currentProfile.name} (0 Gol - Henüz sıralamada yok)`;
        }
      } else {
        myRankText.textContent = '-';
      }
    }
  }

  // 9. Socket Events
  socket.on('connect', () => {
    myId = socket.id;
    if (isJoinedGame) {
      const { name, avatar } = getActiveProfile();
      socket.emit('join_game', { name, avatar, team: myLastTeam || 'red' });
    }
  });

  socket.on('init_stadium', (stadiumData) => {
    renderer.setStadium(stadiumData);
    if (stadiumData && stadiumData.preset) {
      currentMatchSetup.map = stadiumData.preset;
      updateMatchSetupSummary();
    }
  });

  socket.on('stadium_changed', (stadiumData) => {
    renderer.setStadium(stadiumData);
    if (stadiumData && stadiumData.preset) {
      currentMatchSetup.map = stadiumData.preset;
      updateMatchSetupSummary();
    }
  });

  socket.on('player_joined', (data) => {
    myId = data.id;
  });

  socket.on('game_state', (state) => {
    latestGameState = state;

    if (trainingManager && trainingManager.isActive && state.ball) {
      trainingManager.checkTargetHit(state.ball);
    }

    // Update Scoreboard only when scores change
    if (state.scores.red !== lastScoreRed) {
      lastScoreRed = state.scores.red;
      scoreRedElem.textContent = state.scores.red;
    }
    if (state.scores.blue !== lastScoreBlue) {
      lastScoreBlue = state.scores.blue;
      scoreBlueElem.textContent = state.scores.blue;
    }

    // Update Match Timer & Format Badge only when changed
    const mins = Math.floor(state.timeElapsed / 60);
    const secs = state.timeElapsed % 60;
    const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    if (timeStr !== lastMatchTimeStr) {
      lastMatchTimeStr = timeStr;
      matchTimerElem.textContent = timeStr;
    }

    if (matchFormatBadge && state.matchConfig) {
      const durStr = (state.timeLimit && state.timeLimit < 9999) ? `${Math.round(state.timeLimit / 60)} Dk` : 'Limitsiz';
      const badgeStr = `${state.matchConfig.format || '1v1'} • ${durStr}`;
      if (matchFormatBadge.textContent !== badgeStr) {
        matchFormatBadge.textContent = badgeStr;
      }
    }

    // Update Status Text only when changed
    let statusText = 'BEKLENİYOR';
    let statusColor = 'var(--text-muted)';
    if (state.isPaused) {
      statusText = 'DURAKLATILDI';
      statusColor = 'var(--accent-gold)';
    } else if (state.state === 'WALKOUT') {
      statusText = 'SAHAYA ÇIKIŞ';
      statusColor = 'var(--accent-gold)';
    } else if (state.state === 'PLAYING') {
      statusText = 'OYUNDA';
      statusColor = '#4ade80';
    } else if (state.state === 'OVERTIME') {
      statusText = 'ALTIN GOL';
      statusColor = 'var(--accent-gold)';
    } else if (state.state === 'WAITING') {
      statusText = 'BEKLENİYOR';
      statusColor = 'var(--text-muted)';
    } else if (state.state === 'GOAL_CELEBRATION') {
      statusText = 'GOL!';
      statusColor = 'var(--accent-gold)';
    } else if (state.state === 'COUNTDOWN') {
      statusText = 'BAŞLIYOR...';
      statusColor = '#38bdf8';
    } else if (state.state === 'GAME_OVER') {
      statusText = 'BİTTİ';
      statusColor = '#f87171';
    }
    if (statusText !== lastMatchStatus) {
      lastMatchStatus = statusText;
      matchStateElem.textContent = statusText;
    }
    if (statusColor !== lastStatusColor) {
      lastStatusColor = statusColor;
      matchStateElem.style.color = statusColor;
    }

    // Sync Walkout Banner Visibility
    if (walkoutBanner) {
      const isWalkout = (state.state === 'WALKOUT');
      if (walkoutBanner.classList.contains('hidden') === isWalkout) {
        if (isWalkout) walkoutBanner.classList.remove('hidden');
        else walkoutBanner.classList.add('hidden');
      }
    }

    // Update Live Possession (hidden in bomb mode)
    if (state.gameMode === 'bomb') {
      if (possessionBarContainer && !possessionBarContainer.classList.contains('hidden')) {
        possessionBarContainer.classList.add('hidden');
      }
    } else {
      if (possessionBarContainer && possessionBarContainer.classList.contains('hidden')) {
        possessionBarContainer.classList.remove('hidden');
      }
      if (state.stats && state.stats.possession && state.stats.possession.red !== lastPossessionRed) {
        lastPossessionRed = state.stats.possession.red;
        const bluePct = 100 - lastPossessionRed;
        possessionRed.textContent = `${lastPossessionRed}%`;
        possessionBlue.textContent = `${bluePct}%`;
        possessionFill.style.width = `${lastPossessionRed}%`;
      }
    }

    // Update Bomb Mode HUD Capsule
    if (hudBombBanner && hudBombTimer && hudBombTeam) {
      const showBomb = (state.gameMode === 'bomb' && !!state.bomb);
      if (showBomb !== lastBombVisible) {
        lastBombVisible = showBomb;
        if (showBomb) hudBombBanner.classList.remove('hidden');
        else hudBombBanner.classList.add('hidden');
      }
      if (showBomb) {
        if (state.bomb.timer !== lastBombTimer) {
          lastBombTimer = state.bomb.timer;
          hudBombTimer.textContent = state.bomb.timer;
        }
        let bTeamText = 'EBE YOK (ORTADA)';
        let bClass = 'hud-bomb-capsule';
        if (state.bomb.holderPlayer) {
          const isRed = (state.bomb.holderPlayer.team === 'red');
          bTeamText = `💣 EBE: ${state.bomb.holderPlayer.name}`;
          bClass = `hud-bomb-capsule ${isRed ? 'red-hold' : 'blue-hold'}`;
        } else if (state.bomb.holderTeam === 'red') {
          bTeamText = '🔴 KIRMIZI';
          bClass = 'hud-bomb-capsule red-hold';
        } else if (state.bomb.holderTeam === 'blue') {
          bTeamText = '🔵 MAVİ';
          bClass = 'hud-bomb-capsule blue-hold';
        }
        if (state.bomb.ticks <= 180 && state.bomb.ticks > 0) {
          bClass += ' urgent';
        }
        if (bTeamText !== lastBombTeamText) {
          lastBombTeamText = bTeamText;
          hudBombTeam.textContent = bTeamText;
        }
        if (bClass !== lastBombClass) {
          lastBombClass = bClass;
          hudBombBanner.className = bClass;
        }
      }
    }

    // Check if current player is eliminated in locker room
    const myPlayer = state.players ? state.players.find(p => p.id === myId) : null;
    const elimBanner = document.getElementById('eliminatedSpectatorBanner');
    if (elimBanner) {
      if (myPlayer && myPlayer.isEliminated) {
        elimBanner.classList.remove('hidden');
      } else {
        elimBanner.classList.add('hidden');
      }
    }
  });

  socket.on('lobby_update', (data) => {
    renderRosters(data.players, data.hostId);

    if (data.botDifficulty) {
      currentMatchSetup.difficulty = data.botDifficulty;
    }
    if (data.stadium && data.stadium.preset) {
      currentMatchSetup.map = data.stadium.preset;
      renderer.setStadium(data.stadium);
    }
    if (data.matchConfig) {
      currentMatchSetup = { ...currentMatchSetup, ...data.matchConfig };
    }
    updateMatchSetupSummary();
  });

  socket.on('sound_event', (ev) => {
    if (ev.type === 'kick') {
      window.soundManager.playKick();
    } else if (ev.type === 'post_hit') {
      window.soundManager.playPost();
      renderer.triggerScreenShake(5, 10);
    } else if (ev.type === 'bomb_tick') {
      window.soundManager.playBombTick(ev.urgency);
    } else if (ev.type === 'bomb_tag') {
      if (window.soundManager.playBombTag) window.soundManager.playBombTag();
    } else if (ev.type === 'bumper_hit') {
      window.soundManager.playBumperHit();
      if (renderer) {
        renderer.triggerScreenShake(3.5, 7);
        if (ev.pos && typeof ev.pos.x === 'number') {
          renderer.triggerBumperHit(ev.pos.x, ev.pos.y);
        }
      }
    }
  });

  socket.on('bomb_exploded', (data) => {
    window.soundManager.playBombExplosion();
    if (renderer) {
      renderer.triggerBombExplosion(data.pos.x, data.pos.y, !!data.isTeamWipedOut);
      if (data.isTeamWipedOut) {
        renderer.spawnConfetti(data.scorerTeam);
      }
    }
    const victimPlayerName = data.victimPlayer ? data.victimPlayer.name : (data.victimTeam === 'red' ? 'Kırmızı Takım' : 'Mavi Takım');
    const victimTeamName = data.victimTeam === 'red' ? 'Kırmızı' : 'Mavi';
    const scorerTeamName = data.scorerTeam === 'red' ? 'Kırmızı' : 'Mavi';

    // Show big animated explosion banner
    if (goalBanner && goalBannerText && goalTeamText) {
      if (data.isTeamWipedOut) {
        goalBannerText.textContent = '💥 BOOOOM!';
        goalTeamText.textContent = `🏆 ${scorerTeamName.toUpperCase()} TAKIM OYUNU KAZANDI!`;
        goalBanner.style.borderColor = (data.scorerTeam === 'red') ? '#ff3b30' : '#0080ff';
        goalBanner.classList.remove('hidden');
        setTimeout(() => {
          goalBanner.classList.add('hidden');
        }, 2600);
      } else {
        goalBannerText.textContent = '💥 ELENDİ!';
        goalTeamText.textContent = `🪑 ${victimPlayerName.toUpperCase()} YEDEK KULÜBESİNE GEÇTİ! (${data.redAlive} vs ${data.blueAlive})`;
        goalBanner.style.borderColor = '#ff3b30';
        goalBanner.classList.remove('hidden');
        setTimeout(() => {
          goalBanner.classList.add('hidden');
        }, 2200);
      }
    }

    if (data.isTeamWipedOut) {
      appendChatMessage({
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sender: '💣 BOMBA',
        team: data.scorerTeam,
        message: `🏆 BOOOOM! ${victimPlayerName} patladı ve ${victimTeamName} takımın tüm oyuncuları elendi! ${scorerTeamName} Takım OYUNU KAZANDI! 🎉`
      });
    } else {
      appendChatMessage({
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sender: '💣 BOMBA',
        team: data.scorerTeam,
        message: `💥 ${victimPlayerName} patlayarak elendi ve Yedek Kulübesi'ne oturdu! Sahada kalanlar: ${data.redAlive} Kırmızı vs ${data.blueAlive} Mavi! ⚔️`
      });
    }
  });

  socket.on('overtime_started', () => {
    window.soundManager.playGoal();
    overtimeBanner.classList.remove('hidden');
    setTimeout(() => {
      overtimeBanner.classList.add('hidden');
    }, 3000);
  });

  socket.on('round_resumed', () => {
    goalBanner.classList.add('hidden');
    if (kickoffCountdownOverlay) kickoffCountdownOverlay.classList.add('hidden');
    const elimBanner = document.getElementById('eliminatedSpectatorBanner');
    if (elimBanner) elimBanner.classList.add('hidden');
  });

  socket.on('kickoff_countdown', (data) => {
    if (!kickoffCountdownOverlay || !countdownNumber) return;
    const count = data.count;
    const badge = kickoffCountdownOverlay.querySelector('.countdown-badge');

    // If goal replay is still running, stop it so the pitch and kickoff line are visible
    if (renderer && renderer.isReplaying) {
      renderer.stopReplay();
    }
    goalBanner.classList.add('hidden');

    if (count > 0) {
      countdownNumber.textContent = count;
      if (countdownSubtext) {
        countdownSubtext.textContent = count === 3 ? 'HAZIRLANIN!' : (count === 2 ? 'DİKKAT!' : 'POZİSYON ALIN!');
      }

      if (badge) {
        badge.className = `countdown-badge count-${count}`;
        badge.style.animation = 'none';
        void badge.offsetWidth;
        badge.style.animation = '';
      }

      kickoffCountdownOverlay.classList.remove('hidden');

      if (window.soundManager && window.soundManager.playCountdownBeep) {
        window.soundManager.playCountdownBeep(count);
      }
    } else {
      // count === 0 -> BAŞLA!
      countdownNumber.textContent = data.text || 'BAŞLA!';
      if (countdownSubtext) {
        countdownSubtext.textContent = 'DÜDÜK ÇALDI!';
      }
      if (badge) {
        badge.className = 'countdown-badge count-go';
        badge.style.animation = 'none';
        void badge.offsetWidth;
        badge.style.animation = '';
      }

      if (window.soundManager && window.soundManager.playWhistle) {
        window.soundManager.playWhistle();
      }

      setTimeout(() => {
        if (kickoffCountdownOverlay) {
          kickoffCountdownOverlay.classList.add('hidden');
        }
      }, 750);
    }
  });

  socket.on('match_started', (data) => {
    statsModal.classList.add('hidden');
    gameOverBanner.classList.add('hidden');
    goalBanner.classList.add('hidden');
    // Clear saved replays from previous match
    renderer.savedGoalReplays = [];
    if (replaysCard) replaysCard.classList.add('hidden');

    if (data && data.matchConfig) {
      currentMatchSetup = { ...currentMatchSetup, ...data.matchConfig };
      updateSetupUIFromState();
      if (renderer && data.matchConfig.weather) {
        renderer.setWeather(data.matchConfig.weather);
      }
    }
  });

  // Walkout Ceremony & Kickoff Whistle Event Handlers
  socket.on('walkout_started', () => {
    if (walkoutBanner) walkoutBanner.classList.remove('hidden');
    if (kickoffWhistleBanner) kickoffWhistleBanner.classList.add('hidden');
  });

  socket.on('match_whistle', () => {
    if (walkoutBanner) walkoutBanner.classList.add('hidden');
    if (window.soundManager && window.soundManager.playWhistle) {
      window.soundManager.playWhistle();
    }
    if (kickoffWhistleBanner) {
      kickoffWhistleBanner.classList.remove('hidden');
      setTimeout(() => {
        if (kickoffWhistleBanner) kickoffWhistleBanner.classList.add('hidden');
      }, 1500);
    }
  });

  if (btnSkipWalkout) {
    btnSkipWalkout.addEventListener('click', () => {
      socket.emit('skip_walkout');
    });
  }

  window.skipWalkoutIfActive = () => {
    if (latestGameState && latestGameState.state === 'WALKOUT') {
      socket.emit('skip_walkout');
      return true;
    }
    return false;
  };

  socket.on('match_configured', (config) => {
    if (config) {
      currentMatchSetup = { ...currentMatchSetup, ...config };
      updateSetupUIFromState();
      if (renderer && config.weather) {
        renderer.setWeather(config.weather);
      }
    }
  });

  socket.on('profile_data', (data) => {
    if (data && data.profile) {
      updateProfileUI(data.profile, data.rank);
    }
  });

  socket.on('leaderboard_update', (leaderboard) => {
    renderLeaderboard(leaderboard);
  });

  socket.on('goal_scored', (data) => {
    // Screen shake, Confetti & Cinematic Goal Zoom!
    renderer.triggerScreenShake(9, 16);
    renderer.spawnConfetti(data.team);
    const goalX = data.team === 'red' ? renderer.stadium.halfW : -renderer.stadium.halfW;
    renderer.triggerGoalZoom(goalX, 0, 180);
    window.soundManager.playGoal();

    const isRed = data.team === 'red';

    // Broadcast goal & crown announcement in chat (with milestone text, e.g. "Bu maçtaki 2., kariyerindeki 46. golü!")
    if (data.scorerName) {
      const rankText = data.scorerRank ? ` | 👑 Gol Krallığı #${data.scorerRank}` : '';
      const milestoneChat = data.milestoneText ? ` (${data.milestoneText}${rankText})` : (data.scorerTotalGoals ? ` (Toplam: ${data.scorerTotalGoals} Gol${rankText})` : '');
      const chatMsg = data.isOwnGoal
        ? `${data.scorerName} şanssız bir an yaşadı ve topu kendi kalesine gönderdi! (K.K.)`
        : `${data.scorerName} muhteşem bir gol attı ve Tacı giydi! 👑 ${milestoneChat}`;
      appendChatMessage({
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sender: '👑 HAKEM',
        team: data.team,
        message: chatMsg
      });
    }

    // If current player scored, update their local goals count immediately
    if (!data.isOwnGoal && currentProfile && data.scorerName && data.scorerName.toLowerCase() === currentProfile.name.toLowerCase()) {
      if (data.scorerTotalGoals) {
        currentProfile.goals = data.scorerTotalGoals;
        updateProfileUI(currentProfile, data.scorerRank);
      }
    }

    // Set Goal Banner content
    if (data.isOwnGoal) {
      goalBannerText.textContent = '⚡ KENDİ KALESİNE GOL!';
      goalTeamText.textContent = `🤦‍♂️ ${data.scorerName} (K.K.)`;
      if (goalMilestoneBadge) goalMilestoneBadge.classList.add('hidden');
      goalBanner.style.borderColor = '#ff4757';
    } else {
      goalBannerText.textContent = data.isGoldenGoal ? '⚡ ALTIN GOL!' : 'GOOOOOOOL!';
      goalTeamText.textContent = data.scorerName
        ? `👑 ${data.scorerName} GOLÜ ATTI VE TACI GİYDİ!`
        : (isRed ? 'KIRMIZI TAKIM GOLÜ ATTI!' : 'MAVİ TAKIM GOLÜ ATTI!');
      if (goalMilestoneText && data.milestoneText) {
        goalMilestoneText.textContent = data.milestoneText;
        if (goalMilestoneBadge) goalMilestoneBadge.classList.remove('hidden');
      } else if (goalMilestoneBadge) {
        goalMilestoneBadge.classList.add('hidden');
      }
      goalBanner.style.borderColor = data.scorerName ? '#ffd700' : (isRed ? 'var(--red-team)' : 'var(--blue-team)');
    }

    // Show Goal Banner immediately so players see the scorer and milestone right away!
    goalBanner.classList.remove('hidden');
    setTimeout(() => {
      goalBanner.classList.add('hidden');
    }, 3200);

    // Start Slow-Motion Instant Replay (with milestoneText passed for replay badge & post-match card)
    renderer.startReplay(() => {
      // Replay completed
    }, {
      scorerName: data.scorerName || (isRed ? 'Kırmızı Takım' : 'Mavi Takım'),
      team: data.team,
      timeFormatted: data.timeFormatted,
      isOwnGoal: data.isOwnGoal,
      milestoneText: data.milestoneText || ''
    });
  });

  socket.on('match_ended', (data) => {
    window.soundManager.playGoal();
    const winnerText = data.winner === 'red' ? '🏆 KIRMIZI TAKIM KAZANDI!' :
                       (data.winner === 'blue' ? '🏆 MAVİ TAKIM KAZANDI!' : '🤝 DOSTLUK KAZANDI (BERABERE)');

    winnerBannerText.textContent = winnerText;
    finalScoreText.textContent = `${data.scores.red} - ${data.scores.blue}`;

    // Populate Goal Scorers List (Including K.K.)
    renderMatchGoals(data.goalEvents);

    // Populate Match Goal Replays (Maç Sonu Tekrarlar)
    renderMatchReplays();

    gameOverBanner.classList.remove('hidden');

    // Populate Stats Modal
    if (data.stats) {
      statsWinnerTitle.textContent = winnerText;
      statsScoreText.textContent = `${data.scores.red} - ${data.scores.blue}`;
      statRedPossession.textContent = `${data.stats.possession.red}%`;
      statBluePossession.textContent = `${data.stats.possession.blue}%`;
      statRedShots.textContent = data.stats.shots.red;
      statBlueShots.textContent = data.stats.shots.blue;

      const statCrownHolder = document.getElementById('statCrownHolder');
      if (statCrownHolder) {
        statCrownHolder.textContent = data.crownedPlayerName ? `👑 ${data.crownedPlayerName}` : '-';
      }
    }

    const isTournamentMatch = tournamentManager && tournamentManager.isTournamentActive;
    if (tournamentManager) {
      tournamentManager.onMatchEnd(data.winner);
    }

    setTimeout(() => {
      gameOverBanner.classList.add('hidden');
      if (!isTournamentMatch) {
        statsModal.classList.remove('hidden');
      }
    }, 2800);
  });

  // Render Post-Match Goal Replays Buttons
  function renderMatchReplays() {
    if (!replaysCard || !replaysBtnContainer) return;
    replaysBtnContainer.innerHTML = '';

    const replays = renderer.savedGoalReplays || [];
    if (replays.length === 0) {
      replaysCard.classList.add('hidden');
      return;
    }

    replaysCard.classList.remove('hidden');

    replays.forEach((rep, idx) => {
      const wrap = document.createElement('span');
      wrap.style.display = 'inline-flex';
      wrap.style.gap = '4px';
      wrap.style.alignItems = 'center';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `btn-replay-item ${rep.team === 'red' ? 'red' : 'blue'}`;
      btn.style.padding = '6px 12px';
      btn.style.fontSize = '12px';
      btn.style.fontWeight = '700';
      btn.style.borderRadius = '6px';
      btn.style.cursor = 'pointer';
      btn.style.display = 'inline-flex';
      btn.style.alignItems = 'center';
      btn.style.gap = '5px';
      btn.style.border = rep.team === 'red' ? '1px solid rgba(230, 57, 70, 0.6)' : '1px solid rgba(0, 128, 255, 0.6)';
      btn.style.background = rep.team === 'red' ? 'rgba(230, 57, 70, 0.2)' : 'rgba(0, 128, 255, 0.2)';
      btn.style.color = '#ffffff';

      const tag = rep.isOwnGoal ? '🤦‍♂️ K.K.' : '⚽';
      btn.innerHTML = `▶️ ${tag} ${escapeHtml(rep.scorerName)} <span style="opacity: 0.7; font-size: 10px;">(${escapeHtml(rep.timeFormatted)})</span>`;

      btn.addEventListener('click', () => {
        // Temporarily hide stats modal so user can watch the replay clearly
        statsModal.classList.add('hidden');
        renderer.playSavedGoalReplay(idx, () => {
          // Once replay finishes, bring stats modal back
          statsModal.classList.remove('hidden');
        });
      });

      const gifBtn = document.createElement('button');
      gifBtn.type = 'button';
      gifBtn.title = 'Gol tekrarını GIF olarak indir';
      gifBtn.style.padding = '6px 10px';
      gifBtn.style.fontSize = '12px';
      gifBtn.style.fontWeight = '700';
      gifBtn.style.borderRadius = '6px';
      gifBtn.style.cursor = 'pointer';
      gifBtn.style.border = '1px solid rgba(255, 209, 102, 0.6)';
      gifBtn.style.background = 'rgba(255, 209, 102, 0.15)';
      gifBtn.style.color = '#ffd700';
      gifBtn.textContent = '🎞️ GIF';

      gifBtn.addEventListener('click', async () => {
        if (!window.ReplayGifExporter) {
          alert('GIF dışa aktarıcı yüklenemedi.');
          return;
        }
        const orig = gifBtn.textContent;
        gifBtn.disabled = true;
        try {
          const blob = await window.ReplayGifExporter.exportReplay(rep, renderer, {
            onProgress: (pct) => { gifBtn.textContent = `%${pct}`; }
          });
          const safeName = String(rep.scorerName || 'gol').replace(/[^a-zA-Z0-9çğıöşüÇĞİÖŞÜ_-]+/g, '_').slice(0, 20);
          window.ReplayGifExporter.downloadBlob(blob, `ballo-gol-${safeName}-${rep.timeFormatted || 'mac'}.gif`);
          gifBtn.textContent = '✅ İndirildi';
          setTimeout(() => { gifBtn.textContent = orig; gifBtn.disabled = false; }, 2500);
        } catch (e) {
          console.warn('GIF export hatası:', e);
          gifBtn.textContent = '❌ Hata';
          setTimeout(() => { gifBtn.textContent = orig; gifBtn.disabled = false; }, 2500);
        }
      });

      wrap.appendChild(btn);
      wrap.appendChild(gifBtn);
      replaysBtnContainer.appendChild(wrap);
    });
  }

  // Render Goal Scorers List in Stats Modal (and game over banner)
  function renderMatchGoals(goalEvents) {
    if (!redGoalsList || !blueGoalsList) return;
    redGoalsList.innerHTML = '';
    blueGoalsList.innerHTML = '';
    let redCount = 0, blueCount = 0;
    const summaryScorers = [];

    if (goalEvents && goalEvents.length > 0) {
      for (const g of goalEvents) {
        const li = document.createElement('li');
        const timeBadge = document.createElement('span');
        timeBadge.className = 'goal-time-badge';
        timeBadge.textContent = g.timeFormatted || '';

        const nameSpan = document.createElement('span');
        const matchGoalSuffix = (!g.isOwnGoal && g.matchGoals && g.matchGoals > 1) ? ` (${g.matchGoals}. Golü)` : '';
        nameSpan.textContent = ` ⚽ ${g.scorerName}${matchGoalSuffix}`;

        li.appendChild(timeBadge);
        li.appendChild(nameSpan);

        if (g.isOwnGoal) {
          const kkTag = document.createElement('span');
          kkTag.className = 'kk-tag';
          kkTag.textContent = 'K.K.';
          li.appendChild(kkTag);
          summaryScorers.push(`${g.scorerName} (K.K.)`);
        } else {
          summaryScorers.push(g.scorerName);
        }

        if (g.team === 'red') {
          redGoalsList.appendChild(li);
          redCount++;
        } else {
          blueGoalsList.appendChild(li);
          blueCount++;
        }
      }
    }

    if (redCount === 0) {
      redGoalsList.innerHTML = '<li class="no-goals-item">Gol atılmadı</li>';
    }
    if (blueCount === 0) {
      blueGoalsList.innerHTML = '<li class="no-goals-item">Gol atılmadı</li>';
    }

    if (gameOverScorersList) {
      gameOverScorersList.textContent = summaryScorers.length > 0
        ? `⚽ ${summaryScorers.join(', ')}`
        : '';
    }
  }

  socket.on('chat_message', (msg) => {
    appendChatMessage(msg);
    if (inGameChatModal && inGameChatModal.classList.contains('hidden') && chatUnreadDot) {
      chatUnreadDot.classList.remove('hidden');
    }
  });

  // 10. Roster Rendering
  function renderRosters(players, hostId) {
    if (listRed) listRed.innerHTML = '';
    if (listSpec) listSpec.innerHTML = '';
    if (listBlue) listBlue.innerHTML = '';

    let red = 0, spec = 0, blue = 0;

    players.forEach((p) => {
      const li = document.createElement('li');
      const crownBadge = p.hasCrown ? ' 👑' : '';
      const hostBadge = (hostId && p.id === hostId) ? ' ⭐' : '';
      li.textContent = `${p.avatar ? `[${p.avatar}] ` : ''}${p.name}${p.isBot ? ' 🤖' : ''}${crownBadge}${hostBadge}`;

      if (p.hasCrown) {
        li.classList.add('crowned-roster-item');
        li.title = 'Son golü atan oyuncu - Taç Sahibi!';
      }
      if (hostId && p.id === hostId) {
        li.title = (li.title ? li.title + ' ' : '') + 'Oda sahibi (maçı yönetebilir)';
      }
      if (p.id === myId) {
        li.classList.add('you-item');
        li.textContent += ' (Sen)';
      }

      if (p.team === 'red') {
        if (listRed) listRed.appendChild(li);
        red++;
      } else if (p.team === 'blue') {
        if (listBlue) listBlue.appendChild(li);
        blue++;
      } else {
        if (listSpec) listSpec.appendChild(li);
        spec++;
      }
    });

    if (countRed) countRed.textContent = red;
    if (countSpec) countSpec.textContent = spec;
    if (countBlue) countBlue.textContent = blue;
  }

  // 11. Chat Appender
  function appendChatMessage(data) {
    const item = document.createElement('div');
    item.className = 'chat-message';

    const timeSpan = document.createElement('span');
    timeSpan.className = 'chat-time';
    timeSpan.textContent = data.time;

    const senderSpan = document.createElement('span');
    senderSpan.className = `chat-sender ${data.team}`;
    senderSpan.textContent = `${data.sender}:`;

    const textSpan = document.createElement('span');
    textSpan.className = 'chat-text';
    textSpan.textContent = ` ${data.message}`;

    item.appendChild(timeSpan);
    item.appendChild(senderSpan);
    item.appendChild(textSpan);

    chatMessages.appendChild(item);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --- VISUAL STADIUM MAKER (EDITOR) CONTROLLER ---
  let customStadium = {
    name: 'Özel Saham',
    size: 'standard',
    width: 800,
    height: 400,
    theme: 'turf',
    goalWidth: 150,
    goalDepth: 70,
    wallBounciness: 0.95,
    ballDamping: 0.99,
    bumpers: []
  };

  try {
    const saved = localStorage.getItem('ballo_custom_stadium') || localStorage.getItem('haxball_custom_stadium');
    if (saved) {
      customStadium = { ...customStadium, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.warn('Error reading saved custom stadium', e);
  }

  const stadiumEditorModal = document.getElementById('stadiumEditorModal');
  const btnOpenStadiumEditor = document.getElementById('btnOpenStadiumEditor');
  const btnCloseStadiumEditor = document.getElementById('btnCloseStadiumEditor');
  const btnPlayCustomStadium = document.getElementById('btnPlayCustomStadium');
  const btnSaveCustomStadium = document.getElementById('btnSaveCustomStadium');
  const editorCanvas = document.getElementById('editorCanvas');
  const editorSummaryDim = document.getElementById('editorSummaryDim');
  const editorSummaryTheme = document.getElementById('editorSummaryTheme');
  const editorBumperCount = document.getElementById('editorBumperCount');

  let editorTool = 'bumper'; // 'bumper' | 'delete'

  function getEditorScaleAndOrigin() {
    if (!editorCanvas) return { scale: 1, originX: 0, originY: 0 };
    const cw = editorCanvas.width;
    const ch = editorCanvas.height;
    const pad = 36;
    const scaleX = (cw - pad * 2) / (customStadium.width + 110);
    const scaleY = (ch - pad * 2) / (customStadium.height + 60);
    const scale = Math.min(scaleX, scaleY);
    return { scale, originX: cw / 2, originY: ch / 2 };
  }

  function renderEditorCanvas() {
    if (!editorCanvas) return;
    const ctx = editorCanvas.getContext('2d');
    const cw = editorCanvas.width;
    const ch = editorCanvas.height;

    ctx.clearRect(0, 0, cw, ch);

    // Dark Background
    ctx.fillStyle = '#0a0d16';
    ctx.fillRect(0, 0, cw, ch);

    const { scale, originX, originY } = getEditorScaleAndOrigin();
    const halfW = (customStadium.width / 2) * scale;
    const halfH = (customStadium.height / 2) * scale;
    const goalHalfW = (customStadium.goalWidth / 2) * scale;
    const goalDepth = 35 * scale;

    // Outer pitch bevel
    ctx.save();
    ctx.fillStyle = '#05070c';
    ctx.beginPath();
    ctx.roundRect(originX - halfW - 16, originY - halfH - 16, (halfW + 16) * 2, (halfH + 16) * 2, 12);
    ctx.fill();

    // Pitch surface
    if (customStadium.theme === 'futsal') {
      ctx.fillStyle = '#b0733c';
    } else if (customStadium.theme === 'hockey') {
      ctx.fillStyle = '#d4ebf9';
    } else if (customStadium.theme === 'street') {
      ctx.fillStyle = '#2b313d';
    } else if (customStadium.theme === 'neon') {
      ctx.fillStyle = '#0a0e18';
    } else {
      ctx.fillStyle = '#186330';
    }
    ctx.fillRect(originX - halfW, originY - halfH, halfW * 2, halfH * 2);

    // Cyber grid for neon theme
    if (customStadium.theme === 'neon') {
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.12)';
      ctx.lineWidth = 1;
      for (let x = originX - halfW; x <= originX + halfW; x += 25 * scale) {
        ctx.beginPath();
        ctx.moveTo(x, originY - halfH);
        ctx.lineTo(x, originY + halfH);
        ctx.stroke();
      }
    }

    // Border markings
    ctx.strokeStyle = customStadium.theme === 'neon' ? '#00f0ff' : (customStadium.theme === 'hockey' ? '#225588' : 'rgba(255, 255, 255, 0.75)');
    ctx.lineWidth = 2;
    ctx.strokeRect(originX - halfW, originY - halfH, halfW * 2, halfH * 2);

    // Center Line
    ctx.beginPath();
    ctx.moveTo(originX, originY - halfH);
    ctx.lineTo(originX, originY + halfH);
    ctx.stroke();

    // Center Circle
    ctx.beginPath();
    ctx.arc(originX, originY, 40 * scale, 0, Math.PI * 2);
    ctx.stroke();

    // Goal Nets
    ctx.strokeStyle = '#ef4444';
    ctx.strokeRect(originX - halfW - goalDepth, originY - goalHalfW, goalDepth, goalHalfW * 2);
    ctx.strokeStyle = '#0284c7';
    ctx.strokeRect(originX + halfW, originY - goalHalfW, goalDepth, goalHalfW * 2);

    // Posts
    const postR = 4;
    ctx.fillStyle = '#ffffff';
    // Left posts
    ctx.beginPath(); ctx.arc(originX - halfW, originY - goalHalfW, postR, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(originX - halfW, originY + goalHalfW, postR, 0, Math.PI * 2); ctx.fill();
    // Right posts
    ctx.beginPath(); ctx.arc(originX + halfW, originY - goalHalfW, postR, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(originX + halfW, originY + goalHalfW, postR, 0, Math.PI * 2); ctx.fill();

    // Draw Bumpers
    const bumpers = customStadium.bumpers || [];
    bumpers.forEach(b => {
      const bx = originX + b.x * scale;
      const by = originY + b.y * scale;
      const br = (b.radius || 20) * scale;

      ctx.save();
      ctx.shadowColor = b.color || '#ff007f';
      ctx.shadowBlur = 10;
      ctx.fillStyle = b.color || '#ff007f';
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.max(9, br * 0.9)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚡', bx, by);
      ctx.restore();
    });

    ctx.restore();
  }

  function updateEditorUI() {
    const sizePills = document.querySelectorAll('#editorSizePills .btn-micro-pill');
    sizePills.forEach(p => {
      p.classList.toggle('active', p.getAttribute('data-size') === customStadium.size);
    });

    const themePills = document.querySelectorAll('#editorThemePills .btn-micro-pill');
    themePills.forEach(p => {
      p.classList.toggle('active', p.getAttribute('data-theme') === customStadium.theme);
    });

    const goalPills = document.querySelectorAll('#editorGoalPills .btn-micro-pill');
    goalPills.forEach(p => {
      p.classList.toggle('active', Number(p.getAttribute('data-goal')) === customStadium.goalWidth);
    });

    const toolPills = document.querySelectorAll('#editorToolPills .btn-micro-pill');
    toolPills.forEach(p => {
      p.classList.toggle('active', p.getAttribute('data-tool') === editorTool);
    });

    if (editorSummaryDim) editorSummaryDim.textContent = `${customStadium.width}x${customStadium.height}`;
    if (editorSummaryTheme) {
      const themeMap = { turf: '🌿 Classic Çim', futsal: '🪵 Futsal', street: '🧱 Sokak', hockey: '❄️ Buz', neon: '⚡ Siber Neon' };
      editorSummaryTheme.textContent = themeMap[customStadium.theme] || customStadium.theme;
    }
    if (editorBumperCount) editorBumperCount.textContent = (customStadium.bumpers || []).length;
  }

  function openStadiumEditor() {
    closePauseMenu();
    if (mainMenuModal) mainMenuModal.classList.add('hidden');
    if (stadiumEditorModal) stadiumEditorModal.classList.remove('hidden');
    updateEditorUI();
    renderEditorCanvas();
  }

  function closeStadiumEditor() {
    if (stadiumEditorModal) stadiumEditorModal.classList.add('hidden');
    if (!latestGameState || latestGameState.state === 'WAITING' || latestGameState.state === 'GAME_OVER') {
      if (mainMenuModal) mainMenuModal.classList.remove('hidden');
    }
  }

  if (btnOpenStadiumEditor) {
    btnOpenStadiumEditor.addEventListener('click', openStadiumEditor);
  }

  if (btnCloseStadiumEditor) {
    btnCloseStadiumEditor.addEventListener('click', closeStadiumEditor);
  }

  // Size pill clicks
  document.querySelectorAll('#editorSizePills .btn-micro-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const sizeKey = pill.getAttribute('data-size');
      customStadium.size = sizeKey;
      if (sizeKey === 'compact') {
        customStadium.width = 700;
        customStadium.height = 380;
      } else if (sizeKey === 'big') {
        customStadium.width = 1000;
        customStadium.height = 520;
      } else {
        customStadium.width = 800;
        customStadium.height = 400;
      }
      updateEditorUI();
      renderEditorCanvas();
    });
  });

  // Theme pill clicks
  document.querySelectorAll('#editorThemePills .btn-micro-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      customStadium.theme = pill.getAttribute('data-theme');
      updateEditorUI();
      renderEditorCanvas();
    });
  });

  // Goal pill clicks
  document.querySelectorAll('#editorGoalPills .btn-micro-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      customStadium.goalWidth = Number(pill.getAttribute('data-goal')) || 150;
      updateEditorUI();
      renderEditorCanvas();
    });
  });

  // Tool pill clicks (add bumper or delete)
  document.querySelectorAll('#editorToolPills .btn-micro-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      editorTool = pill.getAttribute('data-tool');
      updateEditorUI();
    });
  });

  // Templates
  const btnTplPinball = document.getElementById('btnTplPinball');
  if (btnTplPinball) {
    btnTplPinball.addEventListener('click', () => {
      customStadium.bumpers = [
        { x: 0, y: -90, radius: 22, bounciness: 1.7, color: '#ff007f' },
        { x: 0, y: 90, radius: 22, bounciness: 1.7, color: '#ff007f' },
        { x: -160, y: 0, radius: 22, bounciness: 1.7, color: '#00f0ff' },
        { x: 160, y: 0, radius: 22, bounciness: 1.7, color: '#00f0ff' }
      ];
      updateEditorUI();
      renderEditorCanvas();
    });
  }

  const btnTplCrossbar = document.getElementById('btnTplCrossbar');
  if (btnTplCrossbar) {
    btnTplCrossbar.addEventListener('click', () => {
      customStadium.bumpers = [
        { x: -110, y: -80, radius: 20, bounciness: 1.6, color: '#ffd700' },
        { x: -110, y: 80, radius: 20, bounciness: 1.6, color: '#ffd700' },
        { x: 110, y: -80, radius: 20, bounciness: 1.6, color: '#ffd700' },
        { x: 110, y: 80, radius: 20, bounciness: 1.6, color: '#ffd700' }
      ];
      updateEditorUI();
      renderEditorCanvas();
    });
  }

  const btnTplClear = document.getElementById('btnTplClear');
  if (btnTplClear) {
    btnTplClear.addEventListener('click', () => {
      customStadium.bumpers = [];
      updateEditorUI();
      renderEditorCanvas();
    });
  }

  // Interactive Canvas Click (Place / Remove Bumper)
  if (editorCanvas) {
    editorCanvas.addEventListener('click', (e) => {
      const rect = editorCanvas.getBoundingClientRect();
      const clickX = (e.clientX - rect.left) * (editorCanvas.width / rect.width);
      const clickY = (e.clientY - rect.top) * (editorCanvas.height / rect.height);

      const { scale, originX, originY } = getEditorScaleAndOrigin();
      const pitchX = Math.round((clickX - originX) / scale);
      const pitchY = Math.round((clickY - originY) / scale);

      const halfW = customStadium.width / 2;
      const halfH = customStadium.height / 2;

      // Keep within stadium boundaries
      if (Math.abs(pitchX) > halfW - 35 || Math.abs(pitchY) > halfH - 35) {
        return;
      }

      // Check if clicked on existing bumper
      const clickedIdx = (customStadium.bumpers || []).findIndex(b => {
        return Math.hypot(b.x - pitchX, b.y - pitchY) <= (b.radius + 10);
      });

      if (editorTool === 'delete' || clickedIdx !== -1) {
        if (clickedIdx !== -1) {
          customStadium.bumpers.splice(clickedIdx, 1);
        }
      } else if (editorTool === 'bumper') {
        if ((customStadium.bumpers || []).length < 10) {
          const neonColors = ['#ff007f', '#00f0ff', '#ffd700', '#a855f7', '#ff3b30'];
          const randomColor = neonColors[Math.floor(Math.random() * neonColors.length)];
          customStadium.bumpers.push({
            x: pitchX,
            y: pitchY,
            radius: 20,
            bounciness: 1.6,
            color: randomColor
          });
        }
      }

      updateEditorUI();
      renderEditorCanvas();
    });
  }

  // Save Custom Stadium
  function saveCustomStadiumToStorage() {
    try {
      localStorage.setItem('ballo_custom_stadium', JSON.stringify(customStadium));
      localStorage.setItem('haxball_custom_stadium', JSON.stringify(customStadium));
    } catch (e) {}
  }

  if (btnSaveCustomStadium) {
    btnSaveCustomStadium.addEventListener('click', () => {
      saveCustomStadiumToStorage();
      alert('✅ Özel Stadyum tasarımı kaydedildi!');
    });
  }

  // Play in Custom Stadium
  if (btnPlayCustomStadium) {
    btnPlayCustomStadium.addEventListener('click', () => {
      saveCustomStadiumToStorage();
      currentMatchSetup.map = 'custom';
      launchConfiguredMatch();
      closeStadiumEditor();
    });
  }

  // 12. Main Render Loop
  function gameLoop() {
    renderer.render(latestGameState, myId);
    requestAnimationFrame(gameLoop);
  }

  requestAnimationFrame(gameLoop);
})();
