# Conversation controls for DSH

- **編集** on a sent, text-only user message opens an editor. Saving forks the
  session immediately before that message, sends the revised text in the child,
  and opens the child. The original session and its history remain intact.
- **続きを生成** appears on the latest completed response or output-token limit
  notice. It sends one ordinary continuation prompt. DSH 0.2.1-rc.5 does not
  expose a same-turn resume API, so the continuation is a new recorded turn.

Attachments and steering messages are excluded from editing because copying
their original authorization into a child session is not supported by this
plugin. The plugin uses the current DSH client session and conversation
services; it does not rewrite stored conversation logs.
