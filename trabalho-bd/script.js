/* ===================================================================
 * ARQUIVO JAVASCRIPT PRINCIPAL - VERSÃO COMPLETA E CORRIGIDA
 * ===================================================================
 */

/* ========= FUNÇÕES GLOBAIS (acessíveis pelo HTML) ========= */
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function logout() {
  localStorage.removeItem("loggedUser");
  window.location.href = "index.html";
}

function editDorama(id) {
  const doramaRef = firebase.database().ref("doramas/" + id);
  doramaRef.once("value", (snapshot) => {
    if (snapshot.exists()) {
      const dorama = snapshot.val();
      document.getElementById("title").value = dorama.title;
      document.getElementById("synopsis").value = dorama.synopsis;
      document.getElementById("image").value = dorama.image;
      document.getElementById("editId").value = id;

      document.getElementById("episodeAdminPanel").style.display = "block";
      document.getElementById("editingDoramaTitle").textContent = dorama.title;
      App.currentlyEditingDoramaId = id;
      App.renderEpisodeList(dorama.episodes || {});

      const formSection = document.getElementById("adminPanel");
      if (formSection) {
        formSection.scrollIntoView({ behavior: "smooth" });
      }
    }
  });
}

function deleteDorama(id) {
  if (confirm("Deseja realmente excluir este dorama?")) {
    firebase
      .database()
      .ref("doramas/" + id)
      .remove();
  }
}

function toggleSynopsis(prefix, id) {
  event.preventDefault();
  event.stopPropagation();
  const p = document.getElementById(`synopsis-${prefix}-${id}`);
  const btn = document.getElementById(`btn-${prefix}-${id}`);
  if (!p || !btn) return;

  const isExpanded = p.classList.toggle("expanded");
  btn.textContent = isExpanded ? "Ler menos" : "Ler mais";
}

/* ========= NÚCLEO DA APLICAÇÃO (APP) ========= */
const App = {
  currentUser: null,
  userFavorites: {},
  allDoramasCache: [],
  currentlyEditingDoramaId: null,

  init() {
    this.loadUser();
    this.initGlobalComponents();
    this.router();
  },

  initGlobalComponents() {
    this.setupTheme();
    this.setupSoundEffects();
    this.setupSearch();
    this.populateSearchCache();
  },

  populateSearchCache() {
    const dbRef = firebase.database().ref("doramas");
    dbRef.on("value", (snapshot) => {
      this.allDoramasCache = [];
      snapshot.forEach((childSnapshot) => {
        this.allDoramasCache.push({
          key: childSnapshot.key,
          ...childSnapshot.val(),
        });
      });
    });
  },

  loadUser() {
    const userString = localStorage.getItem("loggedUser");
    if (userString) {
      this.currentUser = JSON.parse(userString);
    }
  },

  router() {
    const path = window.location.pathname.split("/").pop();
    if (path === "index.html" || path === "") this.initLoginPage();
    else if (path === "register.html") this.initRegisterPage();
    else if (path === "home.html") this.initHomePage();
    else if (path === "favoritos.html") this.initFavoritesPage();
    else if (path === "detalhe.html") this.initDetailPage();

    this.initAdminForms();
  },

  initRegisterPage() {
    if (this.currentUser) {
      window.location.href = "home.html";
      return;
    }
    const form = document.getElementById("registerForm");
    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const username = form.username.value;
        const email = form.email.value;
        const password = await hashPassword(form.password.value);
        firebase
          .database()
          .ref("users")
          .orderByChild("email")
          .equalTo(email)
          .once("value", (snapshot) => {
            if (snapshot.exists()) {
              alert("Este email já está cadastrado.");
            } else {
              firebase
                .database()
                .ref("users")
                .push({ username, email, password, type: "user" })
                .then(() => {
                  alert(
                    "Cadastro realizado com sucesso! Redirecionando para o login."
                  );
                  window.location.href = "index.html";
                })
                .catch((err) => alert("Erro ao cadastrar: " + err.message));
            }
          });
      });
    }
  },

  initLoginPage() {
    if (this.currentUser) {
      window.location.href = "home.html";
      return;
    }
    const form = document.getElementById("loginForm");
    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = form.loginEmail.value;
        const password = await hashPassword(form.loginPassword.value);
        firebase
          .database()
          .ref("users")
          .orderByChild("email")
          .equalTo(email)
          .once("value", (snapshot) => {
            if (snapshot.exists()) {
              const userId = Object.keys(snapshot.val())[0];
              const user = snapshot.val()[userId];
              if (user.password === password) {
                localStorage.setItem(
                  "loggedUser",
                  JSON.stringify({ ...user, id: userId })
                );
                window.location.href = "home.html";
                return;
              }
            }
            alert("Email ou senha inválidos.");
          });
      });
    }
  },

  async initHomePage() {
    if (!this.currentUser) {
      window.location.href = "index.html";
      return;
    }
    if (this.currentUser.type === "admin") {
      const adminPanel = document.getElementById("adminPanel");
      if (adminPanel) adminPanel.style.display = "block";
    }
    await this.loadFavorites();
    this.setupDoramaListeners();
    this.setupFavoriteButtonListener();
  },

  async loadFavorites() {
    const favRef = firebase.database().ref(`favoritos/${this.currentUser.id}`);
    const snapshot = await favRef.once("value");
    this.userFavorites = snapshot.val() || {};
  },

  setupDoramaListeners() {
    const dbRef = firebase.database().ref("doramas");
    dbRef.on("value", (snapshot) => {
      const catalogo = document.getElementById("catalogo");
      if (catalogo) catalogo.innerHTML = "";
      snapshot.forEach((childSnapshot) => {
        this.renderDoramaCard("home", childSnapshot.key, childSnapshot.val());
      });
    });
  },

  renderDoramaCard(prefix, key, doramaData) {
    const container = document.getElementById(
      prefix === "home" ? "catalogo" : "favoritosContainer"
    );
    if (!container) return;

    const link = document.createElement("a");
    if (prefix === "home") {
      link.href = `detalhe.html?id=${key}`;
    }

    const card = document.createElement("div");
    card.className = "card";
    card.dataset.id = key;

    const isLong = doramaData.synopsis && doramaData.synopsis.length > 150;
    const isFavorite = this.userFavorites && this.userFavorites[key];

    let buttonsHTML = "";
    if (prefix === "home") {
      const adminButtons =
        this.currentUser.type === "admin"
          ? `<button onclick="event.preventDefault(); event.stopPropagation(); editDorama('${key}')">Editar</button>
             <button onclick="event.preventDefault(); event.stopPropagation(); deleteDorama('${key}')">Excluir</button>`
          : "";

      buttonsHTML = `<div class="btn-group">
        <button id="btn-home-${key}" class="ler-mais-btn ${
        isLong ? "" : "invisible"
      }" onclick="toggleSynopsis('home', '${key}')">Ler mais</button>
        <button class="favorite-btn" data-id="${key}" onclick="event.preventDefault(); event.stopPropagation();">${
        isFavorite ? "💖" : "🖤"
      }</button>
        ${adminButtons}
      </div>`;
    } else {
      buttonsHTML = `<div class="btn-group">
        <button id="btn-fav-${key}" class="ler-mais-btn ${
        isLong ? "" : "invisible"
      }" onclick="toggleSynopsis('fav', '${key}')">Ler mais</button>
        <button class="remover-btn" data-id="${key}">Remover</button>
      </div>`;
    }

    card.innerHTML = `
      <img src="${doramaData.image}" alt="${doramaData.title}" />
      <h3>${doramaData.title}</h3>
      <p id="synopsis-${prefix}-${key}" class="sinopse-box">${
      doramaData.synopsis || ""
    }</p>
      ${buttonsHTML}`;

    link.appendChild(card);
    container.appendChild(link);
  },

  setupFavoriteButtonListener() {
    document.addEventListener("click", async (e) => {
      if (e.target.classList.contains("favorite-btn")) {
        const doramaId = e.target.dataset.id;
        const favRef = firebase
          .database()
          .ref(`favoritos/${this.currentUser.id}/${doramaId}`);
        if (this.userFavorites[doramaId]) {
          await favRef.remove();
          this.userFavorites[doramaId] = false;
          e.target.textContent = "🖤";
        } else {
          await favRef.set(true);
          this.userFavorites[doramaId] = true;
          e.target.textContent = "💖";
        }
      }
    });
  },

  setupSearch() {
    const input = document.getElementById("doramaSearch");
    const resultsContainer = document.getElementById("searchResults");
    if (!input || !resultsContainer) return;

    input.addEventListener("input", () => {
      const filter = input.value.trim().toUpperCase();
      resultsContainer.innerHTML = "";
      if (filter.length === 0) {
        resultsContainer.style.display = "none";
        return;
      }
      const filtered = this.allDoramasCache
        .filter((dorama) => dorama.title.toUpperCase().includes(filter))
        .sort((a, b) => {
          const aTitle = a.title.toUpperCase();
          const bTitle = b.title.toUpperCase();
          const aStarts = aTitle.startsWith(filter);
          const bStarts = bTitle.startsWith(filter);
          if (aStarts && !bStarts) return -1;
          if (!aStarts && bStarts) return 1;
          return aTitle.localeCompare(bTitle, "pt", { sensitivity: "base" });
        });

      resultsContainer.style.display = "block";
      if (filtered.length > 0) {
        filtered.forEach((dorama) => {
          const resultItem = document.createElement("div");
          resultItem.className = "search-result-item";
          resultItem.textContent = dorama.title;
          resultItem.onclick = () => {
            window.location.href = `detalhe.html?id=${dorama.key}`;
          };
          resultsContainer.appendChild(resultItem);
        });
      } else {
        resultsContainer.innerHTML =
          '<div class="search-result-item disabled">Nenhum dorama encontrado</div>';
      }
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".search-container")) {
        resultsContainer.style.display = "none";
      }
    });
  },

  initAdminForms() {
    const doramaForm = document.getElementById("addDoramaForm");
    const episodeForm = document.getElementById("addEpisodeForm");
    if (!doramaForm) return;

    doramaForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const doramaData = {
        title: doramaForm.title.value,
        synopsis: doramaForm.synopsis.value,
        image: doramaForm.image.value,
      };
      const id = doramaForm.editId.value;
      const promise = id
        ? firebase
            .database()
            .ref("doramas/" + id)
            .update(doramaData)
        : firebase.database().ref("doramas").push(doramaData);
      promise
        .then(() => {
          doramaForm.reset();
          document.getElementById("episodeAdminPanel").style.display = "none";
        })
        .catch((err) => alert("Erro: " + err.message));
    });

    if (episodeForm) {
      episodeForm.addEventListener("submit", (e) => {
        e.preventDefault();
        if (!this.currentlyEditingDoramaId) {
          alert("Primeiro, clique em 'Editar' em um dorama.");
          return;
        }

        const episodeData = {
          title: episodeForm.epTitle.value,
          thumbnail: episodeForm.epThumbnail.value,
          url: episodeForm.epUrl.value,
        };

        const episodesRef = firebase
          .database()
          .ref(`doramas/${this.currentlyEditingDoramaId}/episodes`);
        episodesRef
          .push(episodeData)
          .then(() => {
            episodeForm.reset();
            this.refreshEpisodeList(this.currentlyEditingDoramaId);
          })
          .catch((err) => alert("Erro ao adicionar episódio: " + err.message));
      });
    }
  },

  renderEpisodeList(episodes) {
    const listContainer = document.getElementById("currentEpisodesList");
    listContainer.innerHTML = "<h4>Episódios Atuais</h4>";
    if (!episodes || Object.keys(episodes).length === 0) {
      listContainer.innerHTML += "<p>Nenhum episódio cadastrado.</p>";
      return;
    }

    const episodeList = document.createElement("ul");
    Object.keys(episodes).forEach((epKey) => {
      const episode = episodes[epKey];
      const listItem = document.createElement("li");
      listItem.style.display = "flex";
      listItem.style.justifyContent = "space-between";
      listItem.style.marginBottom = "5px";
      listItem.innerHTML = `
              <span>${episode.title}</span>
              <button onclick="App.deleteEpisode('${this.currentlyEditingDoramaId}', '${epKey}')">Excluir</button>
          `;
      episodeList.appendChild(listItem);
    });
    listContainer.appendChild(episodeList);
  },

  deleteEpisode(doramaId, episodeKey) {
    if (confirm(`Deseja realmente excluir este episódio?`)) {
      firebase
        .database()
        .ref(`doramas/${doramaId}/episodes/${episodeKey}`)
        .remove()
        .then(() => this.refreshEpisodeList(doramaId));
    }
  },

  refreshEpisodeList(doramaId) {
    firebase
      .database()
      .ref(`doramas/${doramaId}/episodes`)
      .once("value", (snapshot) => {
        this.renderEpisodeList(snapshot.val() || {});
      });
  },

  initFavoritesPage() {
    if (!this.currentUser) {
      window.location.href = "index.html";
      return;
    }

    if (!document.getElementById("confirmModal")) {
      document.body.insertAdjacentHTML(
        "beforeend",
        `
          <div id="confirmModal" style="display: none;">
            <div class="modal-content">
              <p>Remover este dorama dos favoritos?</p>
              <div class="modal-buttons">
                <button id="confirmYes">Sim</button> <button id="confirmNo">Não</button>
              </div>
            </div>
          </div>`
      );
    }

    const btnHome = document.getElementById("btnHome");
    if (btnHome)
      btnHome.addEventListener("click", () => {
        window.location.href = "home.html";
      });

    const container = document.getElementById("favoritosContainer");
    const confirmModal = document.getElementById("confirmModal");
    let doramaIdParaRemover = null;

    if (container) {
      container.addEventListener("click", (e) => {
        if (e.target.classList.contains("remover-btn")) {
          doramaIdParaRemover = e.target.dataset.id;
          confirmModal.style.display = "flex";
        }
      });
    }

    document.getElementById("confirmYes").addEventListener("click", () => {
      if (doramaIdParaRemover) {
        firebase
          .database()
          .ref(`favoritos/${this.currentUser.id}/${doramaIdParaRemover}`)
          .remove();
        doramaIdParaRemover = null;
      }
      confirmModal.style.display = "none";
    });
    document.getElementById("confirmNo").addEventListener("click", () => {
      confirmModal.style.display = "none";
      doramaIdParaRemover = null;
    });

    const favRef = firebase.database().ref(`favoritos/${this.currentUser.id}`);
    const doramasRef = firebase.database().ref("doramas");

    favRef.on("value", async (favSnapshot) => {
      container.innerHTML = "";
      if (!favSnapshot.exists() || favSnapshot.numChildren() === 0) {
        container.innerHTML =
          '<p class="empty-message">Você ainda não tem doramas favoritos.</p>';
        return;
      }
      this.userFavorites = favSnapshot.val() || {};
      for (const doramaId in this.userFavorites) {
        const doramaSnapshot = await doramasRef.child(doramaId).once("value");
        if (doramaSnapshot.exists()) {
          this.renderDoramaCard("fav", doramaId, doramaSnapshot.val());
        }
      }
    });
  },

  initDetailPage() {
    if (!this.currentUser) {
      window.location.href = "index.html";
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const doramaId = urlParams.get("id");

    if (!doramaId) {
      document.getElementById("dorama-detail-container").innerHTML =
        "<h1>Dorama não encontrado.</h1>";
      return;
    }

    const doramaRef = firebase.database().ref("doramas/" + doramaId);
    doramaRef.on("value", (snapshot) => {
      if (!snapshot.exists()) {
        document.getElementById("dorama-detail-container").innerHTML =
          "<h1>Dorama não encontrado.</h1>";
        return;
      }

      const dorama = snapshot.val();
      document.title = dorama.title;

      let episodesHTML = "<h3>Nenhum episódio cadastrado.</h3>";
      if (dorama.episodes) {
        // CORRIGIDO: Adicionado 'index' para criar um número sequencial
        episodesHTML = Object.keys(dorama.episodes)
          .map((epKey, index) => {
            const episode = dorama.episodes[epKey];
            return `
                    <a href="${
                      episode.url
                    }" target="_blank" class="episode-link">
                        <img src="${episode.thumbnail}" alt="Thumbnail do ${
              episode.title
            }" class="episode-thumbnail">
                        <div class="episode-info">
                            <!-- CORRIGIDO: Usa o 'index' para o número do episódio -->
                            <span class="episode-number">Episódio ${
                              index + 1
                            }</span>
                            <span class="episode-title">${episode.title}</span>
                        </div>
                    </a>
                `;
          })
          .join("");
      }

      const detailContainer = document.getElementById(
        "dorama-detail-container"
      );
      // CORRIGIDO: Adicionado de volta o H2 "Temporadas e episódios"
      detailContainer.innerHTML = `
            <div class="detail-header">
                <img src="${dorama.image}" alt="Poster de ${dorama.title}" id="dorama-poster">
                <div class="detail-header-info">
                    <h1 id="dorama-title">${dorama.title}</h1>
                    <p id="dorama-synopsis">${dorama.synopsis}</p>
                </div>
            </div>
            <div class="detail-content">
                <h2>Temporadas e episódios</h2>
                <div id="episodes-list">
                    ${episodesHTML}
                </div>
            </div>
        `;
    });
  },

  setupTheme() {
    const themeBtn = document.createElement("button");
    themeBtn.className = "toggle-theme";
    document.body.appendChild(themeBtn);
    const applyTheme = (theme) => {
      document.body.classList.toggle("light-mode", theme === "light");
      themeBtn.textContent = theme === "light" ? "☀️" : "🌙";
    };
    themeBtn.addEventListener("click", () => {
      const newTheme = document.body.classList.contains("light-mode")
        ? "dark"
        : "light";
      localStorage.setItem("theme", newTheme);
      applyTheme(newTheme);
    });
    const savedTheme = localStorage.getItem("theme");
    const preferredTheme = window.matchMedia("(prefers-color-scheme: light)")
      .matches
      ? "light"
      : "dark";
    applyTheme(savedTheme || preferredTheme);
  },

  setupSoundEffects() {
    const sound = new Audio(
      "https://cdn.pixabay.com/download/audio/2022/03/15/audio_63a6c09a78.mp3"
    );
    sound.volume = 0.3;
    document.addEventListener("click", (e) => {
      if (e.target.matches("button, a, input")) {
        sound.play();
      }
    });
  },
};

document.addEventListener("DOMContentLoaded", () => {
  App.init();
});
