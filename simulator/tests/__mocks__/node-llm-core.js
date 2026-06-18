/**
 * Mock minimal de @node-llm/core pour les tests Jest (CommonJS).
 *
 * Les tests d'agent testent uniquement planRound (scripted) — planRoundAI n'est
 * jamais appelé dans les tests. Ce mock évite l'erreur d'import ESM de la lib réelle.
 */
'use strict'

class ToolHalt {
  constructor(content) { this.content = content }
  toString()  { return this.content }
}

class Tool {
  halt(content) { return new ToolHalt(content) }
}

function createLLM() { return {} }

module.exports = { Tool, ToolHalt, createLLM, NodeLLM: {} }
