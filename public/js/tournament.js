// Singleplayer Tournament Cup Mode Manager
class TournamentManager {
  constructor(socket, enterGameCallback) {
    this.socket = socket;
    this.enterGame = enterGameCallback;

    this.teams = [
      'Real Madrid',
      'Barcelona',
      'Man City',
      'Arsenal',
      'Galatasaray',
      'Fenerbahçe',
      'Bayern Münih'
    ];

    this.stage = 'QF'; // 'QF', 'SF', 'FINAL', 'FINISHED'
    this.currentMatchIndex = 0;
    this.isTournamentActive = false;
    this.matches = {
      qf: [
        { team1: 'Sen (Oyuncu)', team2: 'Real Madrid', winner: null },
        { team1: 'Man City', team2: 'Barcelona', winner: null },
        { team1: 'Galatasaray', team2: 'Arsenal', winner: null },
        { team1: 'Fenerbahçe', team2: 'Bayern Münih', winner: null }
      ],
      sf: [
        { team1: null, team2: null, winner: null },
        { team1: null, team2: null, winner: null }
      ],
      final: { team1: null, team2: null, winner: null }
    };

    this.initDOM();
  }

  initDOM() {
    this.modal = document.getElementById('tournamentModal');
    this.btnOpenTournament = document.getElementById('btnOpenTournament');
    this.btnCloseTournament = document.getElementById('btnCloseTournament');
    this.btnResetTournament = document.getElementById('btnResetTournament');
    this.btnStartTournamentMatch = document.getElementById('btnStartTournamentMatch');
    this.cupWinnerName = document.getElementById('cupWinnerName');
    this.soloRoomId = null;
    this.onlineData = null;

    if (this.btnOpenTournament) {
      this.btnOpenTournament.addEventListener('click', () => this.open());
    }
    if (this.btnCloseTournament) {
      this.btnCloseTournament.addEventListener('click', () => this.close());
    }
    if (this.btnResetTournament) {
      this.btnResetTournament.addEventListener('click', () => this.resetTournament());
    }
    if (this.btnStartTournamentMatch) {
      this.btnStartTournamentMatch.addEventListener('click', () => this.playCurrentMatch());
    }

    // ---- ONLINE turnuva butonları ----
    const bind = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', fn);
    };
    bind('btnCreateOnlineTournament', () => {
      const sizeEl = document.getElementById('onlineTournamentSize');
      const size = sizeEl ? Number(sizeEl.value) : 4;
      this.socket.emit('create_online_tournament', { size });
    });
    bind('btnJoinOnlineTournament', () => this.socket.emit('join_online_tournament'));
    bind('btnLeaveOnlineTournament', () => this.socket.emit('leave_online_tournament'));
    bind('btnCancelOnlineTournament', () => this.socket.emit('cancel_online_tournament'));
    bind('btnStartOnlineTournament', () => this.socket.emit('start_online_tournament'));

    // ---- ONLINE turnuva server olayları ----
    this.socket.on('online_tournament_update', (data) => this.renderOnline(data));
    // Lobi güncellemesi turnuva özetini de taşır (modal kapalıyken bile güncel kal)
    this.socket.on('lobby_update', (data) => {
      if (data && data.tournament) this.renderOnline(data.tournament);
      else if (data && !data.tournament && this.onlineData && this.onlineData.active) {
        // Turnuva iptal edilmiş
        this.onlineData = null;
        this.renderOnline(null);
      }
    });
    this.socket.on('tournament_match_started', (data) => {
      // Maç başlayınca modalı kapat, sahaya odaklan
      if (this.modal) this.modal.classList.add('hidden');
      this.renderOnline(null, data);
    });
    this.socket.on('online_tournament_end', (data) => {
      const champ = data && data.champion ? data.champion.name : null;
      if (this.cupWinnerName) {
        this.cupWinnerName.textContent = champ ? `👑 ONLINE ŞAMPİYON: ${champ}! 🏆` : 'Turnuva sona erdi.';
      }
      if (this.modal) this.modal.classList.remove('hidden');
      this.socket.emit('get_online_tournament');
    });
  }

  open() {
    this.renderBracket();
    this.socket.emit('get_online_tournament');
    if (this.modal) this.modal.classList.remove('hidden');
  }

  close() {
    if (this.modal) this.modal.classList.add('hidden');
    // Solo mod kendi izole odasını açtıysa temizle ve main lobisine dön
    if (this.soloRoomId && !(this.onlineData && this.onlineData.active)) {
      this.socket.emit('switch_room', { roomId: 'main' });
      this.soloRoomId = null;
    }
    const mainMenuModal = document.getElementById('mainMenuModal');
    if (mainMenuModal) {
      mainMenuModal.classList.remove('hidden');
      if (window.soundManager) window.soundManager.playBGM(true);
    }
  }

  resetTournament() {
    this.stage = 'QF';
    this.isTournamentActive = false;
    this.matches = {
      qf: [
        { team1: 'Sen (Oyuncu)', team2: 'Real Madrid', winner: null },
        { team1: 'Man City', team2: 'Barcelona', winner: null },
        { team1: 'Galatasaray', team2: 'Arsenal', winner: null },
        { team1: 'Fenerbahçe', team2: 'Bayern Münih', winner: null }
      ],
      sf: [
        { team1: null, team2: null, winner: null },
        { team1: null, team2: null, winner: null }
      ],
      final: { team1: null, team2: null, winner: null }
    };
    if (this.cupWinnerName) this.cupWinnerName.textContent = 'Kupayı Kazanan: -';
    this.renderBracket();
  }

  renderBracket() {
    // QF
    const mQF1 = document.getElementById('matchQF1');
    const mQF2 = document.getElementById('matchQF2');
    const mQF3 = document.getElementById('matchQF3');
    const mQF4 = document.getElementById('matchQF4');

    const updateMatchUI = (elem, match, isActive) => {
      if (!elem) return;
      if (isActive) elem.classList.add('active-match');
      else elem.classList.remove('active-match');

      if (match.winner) {
        elem.style.opacity = '0.7';
      } else {
        elem.style.opacity = '1';
      }
    };

    updateMatchUI(mQF1, this.matches.qf[0], this.stage === 'QF');
    updateMatchUI(mQF2, this.matches.qf[1], false);
    updateMatchUI(mQF3, this.matches.qf[2], false);
    updateMatchUI(mQF4, this.matches.qf[3], false);

    // SF
    const sf1T1 = document.getElementById('sf1Team1');
    const sf1T2 = document.getElementById('sf1Team2');
    const sf2T1 = document.getElementById('sf2Team1');
    const sf2T2 = document.getElementById('sf2Team2');
    if (sf1T1) sf1T1.textContent = this.matches.sf[0].team1 || '?';
    if (sf1T2) sf1T2.textContent = this.matches.sf[0].team2 || '?';
    if (sf2T1) sf2T1.textContent = this.matches.sf[1].team1 || '?';
    if (sf2T2) sf2T2.textContent = this.matches.sf[1].team2 || '?';

    const mSF1 = document.getElementById('matchSF1');
    const mSF2 = document.getElementById('matchSF2');
    updateMatchUI(mSF1, this.matches.sf[0], this.stage === 'SF');
    updateMatchUI(mSF2, this.matches.sf[1], false);

    // Final
    const fT1 = document.getElementById('finalTeam1');
    const fT2 = document.getElementById('finalTeam2');
    if (fT1) fT1.textContent = this.matches.final.team1 || '?';
    if (fT2) fT2.textContent = this.matches.final.team2 || '?';

    const mF = document.getElementById('matchFinal');
    updateMatchUI(mF, this.matches.final, this.stage === 'FINAL');

    if (this.btnStartTournamentMatch) {
      if (this.stage === 'FINISHED') {
        this.btnStartTournamentMatch.textContent = '🎉 Turnuva Tamamlandı! Yeniden Başlat';
      } else if (this.stage === 'QF') {
        this.btnStartTournamentMatch.textContent = '⚔️ Çeyrek Final Maçını Başlat (vs Real Madrid)';
      } else if (this.stage === 'SF') {
        this.btnStartTournamentMatch.textContent = `⚔️ Yarı Final Maçını Başlat (vs ${this.matches.sf[0].team2})`;
      } else if (this.stage === 'FINAL') {
        this.btnStartTournamentMatch.textContent = `👑 BÜYÜK FİNAL MAÇI (vs ${this.matches.final.team2})`;
      }
    }
  }

  playCurrentMatch() {
    if (this.stage === 'FINISHED') {
      this.resetTournament();
      return;
    }

    this.isTournamentActive = true;
    // Solo modalı kapat (close içindeki oda temizliği solo aktifken çalışmaz)
    if (this.modal) this.modal.classList.add('hidden');

    // Isolate tournament match in dedicated room
    const tournamentRoomId = 'tourn_' + (this.socket.id || 'solo');
    this.soloRoomId = tournamentRoomId;
    this.socket.emit('switch_room', { roomId: tournamentRoomId });

    // Prepare game arena for tournament
    this.enterGame('red');

    // Bot difficulty increases with each round!
    let botDiff = 'medium';
    if (this.stage === 'SF') botDiff = 'hard';
    if (this.stage === 'FINAL') botDiff = 'extreme';

    setTimeout(() => {
      this.socket.emit('setup_and_start_match', {
        format: '1v1',
        team: 'red',
        duration: 180,
        scoreLimit: 3,
        difficulty: botDiff,
        map: (this.stage === 'FINAL' ? 'big' : 'classic'),
        weather: 'night',
        gameMode: 'classic'
      });
    }, 250);
  }

  onMatchEnd(winner) {
    if (!this.isTournamentActive) return;
    this.isTournamentActive = false;
    if (this.stage === 'FINISHED') return;

    if (winner === 'red') {
      // Player won current stage!
      if (this.stage === 'QF') {
        this.matches.qf[0].winner = 'Sen (Oyuncu)';
        // Simulate other QF winners
        this.matches.qf[1].winner = 'Barcelona';
        this.matches.qf[2].winner = 'Galatasaray';
        this.matches.qf[3].winner = 'Bayern Münih';

        this.matches.sf[0].team1 = 'Sen (Oyuncu)';
        this.matches.sf[0].team2 = 'Barcelona';
        this.matches.sf[1].team1 = 'Galatasaray';
        this.matches.sf[1].team2 = 'Bayern Münih';

        this.stage = 'SF';
      } else if (this.stage === 'SF') {
        this.matches.sf[0].winner = 'Sen (Oyuncu)';
        this.matches.sf[1].winner = 'Galatasaray';

        this.matches.final.team1 = 'Sen (Oyuncu)';
        this.matches.final.team2 = 'Galatasaray';

        this.stage = 'FINAL';
      } else if (this.stage === 'FINAL') {
        this.matches.final.winner = 'Sen (Oyuncu)';
        this.stage = 'FINISHED';
        if (this.cupWinnerName) {
          this.cupWinnerName.textContent = '👑 ŞAMPİYON: Sen (Oyuncu)! 🏆';
        }
      }
      this.renderBracket();
      setTimeout(() => this.open(), 3200);
    } else {
      // Player lost or drew
      this.stage = 'FINISHED';
      if (this.cupWinnerName) {
        this.cupWinnerName.textContent = '❌ Elendin! Tekrar dene.';
      }
      this.renderBracket();
      setTimeout(() => this.open(), 3200);
    }
  }

  // ============ ONLINE TURNUVA RENDER ============
  renderOnline(data, matchStarted) {
    if (data !== undefined && data !== null) {
      this.onlineData = data;
    }
    const statusEl = document.getElementById('onlineTournamentStatus');
    const partsEl = document.getElementById('onlineTournamentParts');
    const d = this.onlineData;

    if (matchStarted) {
      if (statusEl) {
        statusEl.textContent = `⚔️ ${matchStarted.label || 'Maç'}: ${matchStarted.p1 ? matchStarted.p1.name : '?'} vs ${matchStarted.p2 ? matchStarted.p2.name : '?'}`;
      }
    }

    if (!d || !d.active) {
      if (statusEl && !matchStarted) statusEl.textContent = 'Bu odada aktif online turnuva yok.';
      if (partsEl) partsEl.innerHTML = '';
      return;
    }

    // Katılımcı çipleri
    if (partsEl) {
      partsEl.innerHTML = '';
      d.participants.forEach(p => {
        const chip = document.createElement('span');
        chip.textContent = `👤 ${p.name}`;
        chip.style.cssText = 'background: rgba(0,128,255,0.15); border: 1px solid rgba(0,128,255,0.4); border-radius: 12px; padding: 3px 10px; font-size: 12px;';
        partsEl.appendChild(chip);
      });
      const cnt = document.createElement('span');
      cnt.textContent = `${d.participants.length}/${d.size}`;
      cnt.style.cssText = 'font-size: 12px; color: #7dd3fc; font-weight: 700; align-self: center;';
      partsEl.appendChild(cnt);
    }

    const name = (p) => {
      if (!p) return '?';
      const w = d.matches.flat().length ? '' : '';
      return p.name + (p.walkover ? ' (H)' : '');
    };

    if (statusEl) {
      if (d.state === 'LOBBY') {
        statusEl.textContent = `📝 Kayıt açık: ${d.participants.length}/${d.size} oyuncu. Host başlatınca kura çekilir.`;
      } else if (d.state === 'PLAYING') {
        const cur = d.matches[d.currentMatchIdx];
        statusEl.textContent = cur
          ? `⚔️ Sıradaki: ${cur.label} — ${name(cur.p1)} vs ${name(cur.p2)}`
          : 'Turnuva oynanıyor...';
      } else if (d.state === 'DONE') {
        statusEl.textContent = d.champion ? `👑 Şampiyon: ${d.champion.name}!` : 'Turnuva bitti.';
      }
    }

    // Braketi gerçek isimlerle doldur
    const setTeam = (id, p, fallback) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = p ? `${p.name}${p.walkover ? ' (H)' : ''}` : (fallback || '?');
    };
    const markWinner = (boxId, match) => {
      const box = document.getElementById(boxId);
      if (!box) return;
      box.style.opacity = match && match.winner ? '0.7' : '1';
      box.classList.toggle('active-match', !!(match && !match.winner && d.matches[d.currentMatchIdx] === match));
    };

    if (d.size === 4) {
      const [sf1, sf2, f] = d.matches;
      setTeam('sf1Team1', sf1 && sf1.p1); setTeam('sf1Team2', sf1 && sf1.p2);
      setTeam('sf2Team1', sf2 && sf2.p1); setTeam('sf2Team2', sf2 && sf2.p2);
      setTeam('finalTeam1', f && f.p1); setTeam('finalTeam2', f && f.p2);
      markWinner('matchSF1', sf1); markWinner('matchSF2', sf2); markWinner('matchFinal', f);
      // QF kutularını katılımcılarla doldur (bilgi amaçlı)
      const qfIds = ['qf1Team1', 'qf1Team2', 'qf2Team1', 'qf2Team2'];
      d.participants.slice(0, 4).forEach((p, i) => {
        const el = document.getElementById(qfIds[i]);
        if (el) el.textContent = p.name;
      });
      if (this.cupWinnerName) {
        this.cupWinnerName.textContent = d.champion ? `👑 ONLINE ŞAMPİYON: ${d.champion.name}! 🏆` : 'Kupayı Kazanan: - (Online)';
      }
    } else {
      const [qf1, qf2, qf3, qf4, sf1, sf2, f] = d.matches;
      const qfs = [qf1, qf2, qf3, qf4];
      qfs.forEach((m, i) => {
        setTeam(`qf${i + 1}Team1`, m && m.p1); setTeam(`qf${i + 1}Team2`, m && m.p2);
        markWinner(`matchQF${i + 1}`, m);
      });
      setTeam('sf1Team1', sf1 && sf1.p1); setTeam('sf1Team2', sf1 && sf1.p2);
      setTeam('sf2Team1', sf2 && sf2.p1); setTeam('sf2Team2', sf2 && sf2.p2);
      setTeam('finalTeam1', f && f.p1); setTeam('finalTeam2', f && f.p2);
      markWinner('matchSF1', sf1); markWinner('matchSF2', sf2); markWinner('matchFinal', f);
      if (this.cupWinnerName) {
        this.cupWinnerName.textContent = d.champion ? `👑 ONLINE ŞAMPİYON: ${d.champion.name}! 🏆` : 'Kupayı Kazanan: - (Online)';
      }
    }
  }
}
window.TournamentManager = TournamentManager;
