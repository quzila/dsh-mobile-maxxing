window.__ModuleLoader__.load({
  id: "dsh-conversation-controls",
  factory() {
    const PREFIX = "dsh-conversation-controls";
    const CONTINUE_TEXT = "直前の回答の続きから、重複せずに再開してください。";
    const asMessage = (error) => error?.code || error?.message || String(error);

    function textOnly(node) {
      const content = node?.data?.content;
      if (node?.kind !== "user" || !Array.isArray(content) || !Number.isSafeInteger(node.data.seq) || node.data.seq < 1) return null;
      if (content.some((part) => part?.type !== "text" || typeof part.text !== "string")) return null;
      const text = content.map((part) => part.text).join("");
      return text.trim() ? text : null;
    }

    function latestMaxTokens(snapshot, node) {
      return node?.kind === "turn-max-tokens" &&
        snapshot?.timeline?.turnOrder?.at(-1) === node.data?.turn;
    }

    function latestTurnTail(snapshot, node) {
      if (node?.kind !== "turn-tail" || !node.data?.closing ||
          snapshot?.timeline?.turnOrder?.at(-1) !== node.data.turn) return false;
      return ![...snapshot.nodes.values()].some((item) =>
        item.kind === "turn-max-tokens" && item.data?.turn === node.data.turn);
    }

    function makeButton(label, action) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `${PREFIX}-button`;
      button.textContent = label;
      button.setAttribute("aria-label", label);
      button.addEventListener("click", action);
      return button;
    }

    function install(ctx) {
      const style = document.createElement("style");
      style.id = `${PREFIX}-style`;
      style.textContent = `
        .${PREFIX}-button { border:1px solid currentColor; border-radius:6px; background:transparent; color:inherit; cursor:pointer; font:inherit; font-size:12px; padding:3px 8px; margin-left:6px; }
        .${PREFIX}-button:hover { background:var(--dsw-alias-interactive-bg-hover,#5553); }
        .${PREFIX}-button:disabled { cursor:wait; opacity:.5; }
        .${PREFIX}-error { color:#e78a8a; font-size:12px; margin-left:8px; }
        .${PREFIX}-dialog { width:min(640px,calc(100vw - 32px)); border:1px solid #8888; border-radius:12px; background:var(--dsw-alias-bg-primary,#222); color:var(--dsw-alias-label-primary,#eee); padding:20px; box-shadow:0 16px 48px #0008; }
        .${PREFIX}-dialog::backdrop { background:#0009; }
        .${PREFIX}-dialog textarea { box-sizing:border-box; width:100%; min-height:150px; margin:12px 0; padding:10px; resize:vertical; font:inherit; background:var(--dsw-alias-bg-secondary,#333); color:inherit; border:1px solid #8888; border-radius:6px; }
        .${PREFIX}-dialog footer { display:flex; justify-content:flex-end; gap:8px; }
      `;
      document.head.appendChild(style);

      const selected = () => ctx.uiWorkspace.selection.getSnapshot()?.sessionId;
      const current = () => {
        try {
          const sessionId = selected();
          if (!sessionId) return null;
          const binding = ctx.sessions.binding(sessionId);
          if (!binding) return null;
          const snapshot = ctx.uiConversation.binding(binding).target("chat").getSnapshot();
          return snapshot ? { sessionId, binding, snapshot } : null;
        } catch { return null; }
      };

      async function editMessage(sessionId, node, original) {
        const dialog = document.createElement("dialog");
        dialog.className = `${PREFIX}-dialog`;
        const title = document.createElement("h2");
        title.textContent = "送信済みメッセージを編集";
        const explanation = document.createElement("p");
        explanation.textContent = "元の会話は残し、このメッセージの直前から新しい会話を作ります。";
        const editor = document.createElement("textarea");
        editor.value = original;
        editor.setAttribute("aria-label", "編集するメッセージ");
        const error = document.createElement("p");
        error.className = `${PREFIX}-error`;
        error.setAttribute("role", "alert");
        const footer = document.createElement("footer");
        const cancel = makeButton("キャンセル", () => dialog.close());
        const save = makeButton("編集して送信", async () => {
          const revised = editor.value;
          if (!revised.trim()) { error.textContent = "メッセージを入力してください。"; return; }
          if (revised === original) { error.textContent = "変更した文面を入力してください。"; return; }
          save.disabled = true;
          cancel.disabled = true;
          error.textContent = "";
          try {
            if (!dialog.dataset.childSessionId) {
              dialog.dataset.childSessionId = await ctx.sessions.fork({ sessionId, atSeq: node.data.seq - 1, increaseTitle: true });
            }
            const childId = dialog.dataset.childSessionId;
            if (!dialog.dataset.sent) {
              await ctx.sessions.using(childId, { source: PREFIX }, async (reference) => {
                const result = await reference.binding.session.prompt([{ type: "text", text: revised }], "queue");
                if (!result.ok) throw result.error;
              });
              dialog.dataset.sent = "true";
            }
            ctx.uiWorkspace.openSession(childId);
            dialog.close();
          } catch (reason) {
            error.textContent = `編集した会話を開始できません: ${asMessage(reason)}`;
          } finally {
            save.disabled = false;
            cancel.disabled = false;
          }
        });
        footer.append(cancel, save);
        dialog.append(title, explanation, editor, error, footer);
        dialog.addEventListener("close", () => dialog.remove(), { once: true });
        document.body.appendChild(dialog);
        dialog.showModal();
        editor.focus();
        editor.setSelectionRange(editor.value.length, editor.value.length);
      }

      async function continueTurn(sessionId, button, error) {
        button.disabled = true;
        error.textContent = "";
        try {
          await ctx.sessions.using(sessionId, { source: PREFIX }, async (reference) => {
            if (reference.binding.session.getSnapshot().running) throw new Error("応答中です");
            const result = await reference.binding.session.prompt([{ type: "text", text: CONTINUE_TEXT }], "queue");
            if (!result.ok) throw result.error;
          });
        } catch (reason) {
          error.textContent = `再開できません: ${asMessage(reason)}`;
          button.disabled = false;
        }
      }

      function synchronize() {
        const state = current();
        const sessionId = state?.sessionId;
        for (const row of document.querySelectorAll('[data-chat-flow-kind="user"], [data-chat-flow-kind="turn-max-tokens"], [data-chat-flow-kind="turn-tail"]')) {
          const key = row.getAttribute("data-chat-node-key");
          const node = key && state?.snapshot?.nodes?.get(key);
          let existing = row.querySelector(`.${PREFIX}-button`);
          const eligible = node?.kind === "user" ? Boolean(textOnly(node)) :
            (latestMaxTokens(state?.snapshot, node) || latestTurnTail(state?.snapshot, node)) &&
            !state.binding.session.getSnapshot().running;
          if (!eligible || row.dataset.conversationControlsSession !== sessionId) {
            existing?.parentElement?.querySelector(`.${PREFIX}-error`)?.remove();
            existing?.remove();
            existing = null;
            delete row.dataset.conversationControlsSession;
          }
          if (!eligible || existing) continue;
          if (node.kind === "user") {
            const text = textOnly(node);
            const actions = row.querySelector('[data-clock="start"]');
            if (!text || !actions) continue;
            const button = makeButton("編集", () => editMessage(sessionId, node, text));
            button.title = "編集して新しい会話に分岐";
            actions.appendChild(button);
            row.dataset.conversationControlsSession = sessionId;
          } else {
            const target = node.kind === "turn-tail" ? row.querySelector('[data-clock="end"]') :
              row.querySelector('[role="status"]') || row;
            if (!target) continue;
            const error = document.createElement("span");
            error.className = `${PREFIX}-error`;
            error.setAttribute("role", "alert");
            const button = makeButton("続きを生成", () => continueTurn(sessionId, button, error));
            button.title = "新しいターンで続きを生成";
            target.append(button, error);
            row.dataset.conversationControlsSession = sessionId;
          }
        }
      }

      let timer = null;
      const schedule = () => {
        if (timer !== null) return;
        timer = setTimeout(() => { timer = null; synchronize(); }, 120);
      };
      const observer = new MutationObserver(schedule);
      observer.observe(document.body, { childList: true, subtree: true });
      const unselect = ctx.uiWorkspace.selection.subscribe(schedule);
      schedule();
      return () => { unselect(); observer.disconnect(); if (timer !== null) clearTimeout(timer); style.remove(); document.querySelectorAll(`.${PREFIX}-button, .${PREFIX}-error, .${PREFIX}-dialog`).forEach((element) => element.remove()); };
    }

    return {
      inject: ["slots"],
      apply(ctx) {
        ctx.inject(["uiWorkspace", "sessions", "uiConversation"], (scope) => {
          scope.effect(() => install(scope), PREFIX);
        });
      }
    };
  }
});
