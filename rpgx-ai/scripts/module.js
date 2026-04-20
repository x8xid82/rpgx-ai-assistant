// scripts/module.js — Main entry: chat command handling + response display
import { registerSettings, moduleName, getSetting } from "./settings.js";
import { streamReply } from "./gpt-api.js";

Hooks.once("init", () => {
  console.log(`${moduleName} | Initializing RPGX AI v2`);
  registerSettings();
});

// ── Startup performance reminder ──
Hooks.once("ready", () => {
  if (!game.user.isGM) return;

  const show = getSetting("showStartupReminder", true);
  if (!show) return;

  new Dialog({
    title: "RPGX AI — Before You Begin",
    content: `
      <div style="margin-bottom:10px;">
        <p><strong><i class="fa-solid fa-microchip"></i> RPGX AI is active.</strong></p>
        <p>RPGX AI runs language models locally, which demands significant memory and
        processing power. For the smoothest experience, close unnecessary background
        applications — especially games, video editors, or browsers with many tabs open —
        before generating responses.</p>
        <div style="margin-top:12px;">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
            <input type="checkbox" class="rpgx-dismiss-check" />
            Don't show this again
          </label>
        </div>
      </div>
    `,
    buttons: {
      ok: {
        label: "Got it — Let's go",
        icon: '<i class="fa-solid fa-check"></i>',
        callback: (html) => {
          if (html.find(".rpgx-dismiss-check").is(":checked")) {
            game.settings.set(moduleName, "showStartupReminder", false);
          }
        },
      },
    },
    default: "ok",
  }).render(true);
});

// ── Chat command interception ──
Hooks.on("chatMessage", (chatLog, message, chatData) => {
  let match;

  // --- Whisper command: /w rpgx <question> ---
  const reWhisper = /^(\/w(?:hisper)?\s)(\[(?:[^\]]+)\]|(?:[^\s]+))\s*([^]*)/i;
  match = message.match(reWhisper);
  if (match) {
    const userAliases = match[2].replace(/[[\]]/g, "").split(",").map((n) => n.trim());
    const question = match[3].trim();

    if (userAliases.some((u) => u.toLowerCase() === "rpgx")) {
      const users = userAliases
        .filter((n) => n.toLowerCase() !== "rpgx")
        .reduce(
          (arr, n) => arr.concat(ChatMessage.getWhisperRecipients(n)),
          [game.user]
        );

      if (!users.length) {
        throw new Error(game.i18n.localize("ERROR.NoTargetUsersForWhisper"));
      }
      if (
        users.some((u) => !u.isGM && u.id !== game.user.id) &&
        !game.user.can("MESSAGE_WHISPER")
      ) {
        throw new Error(game.i18n.localize("ERROR.CantWhisper"));
      }

      chatData.type = CONST.CHAT_MESSAGE_TYPES.WHISPER;
      chatData.whisper = users.map((u) => u.id);
      chatData.sound = CONFIG.sounds.notification;
      echoQuestion(chatData, question);
      respondTo(question, users);
      return false;
    }
  }

  // --- Public command: /rpgx <question> ---
  const rePublic = /^\/rpgx\s+([^]*)/i;
  match = message.match(rePublic);
  if (match) {
    const question = match[1].trim();
    echoQuestion(chatData, question);
    respondTo(question, []);
    return false;
  }

  return true;
});

/** Echo the user's question into chat so it's visible */
async function echoQuestion(chatData, question) {
  const header =
    '<span class="rpgx-question-header">' +
    '<i class="fa-solid fa-robot"></i> To: RPGX AI</span><br>';
  chatData.content = `${header}${question.replace(/\n/g, "<br>")}`;
  await ChatMessage.create(chatData);
}

/** Send the question to the AI and stream the response into chat */
async function respondTo(question, users) {
  console.debug(`${moduleName} | respondTo("${question}")`, users);
  try {
    await streamReply(question, users);
  } catch (e) {
    console.error(`${moduleName} | Failed to provide response.`, e);
    ui.notifications.error(e.message, { permanent: true, console: false });
  }
}
