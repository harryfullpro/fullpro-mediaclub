# FullPro Media Club — Design Patterns

## Link / URL Fields

Sempre que houver um campo de link (input, display, ou botão de link) no site, usar o padrão visual roxo/violeta:

### Cores
- **Background**: `rgba(139,92,246,.08)` (violeta sutil)
- **Border**: `1px solid rgba(139,92,246,.25)` (violeta 25% opacidade)
- **Border hover/focus**: `rgba(139,92,246,.5)` (violeta mais forte)
- **Texto do link**: `#a78bfa` (violeta claro)
- **Ícone de link**: `#a78bfa`

### Componentes

#### Input de URL (`.url-input`)
```css
.url-input {
  padding: 8px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-family: inherit;
  color: #a78bfa;
  background: rgba(139,92,246,.08);
  border: 1px solid rgba(139,92,246,.25);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  outline: none;
  transition: border-color .15s;
}
.url-input::placeholder { color: rgba(167,139,250,.4); }
.url-input:focus { border-color: rgba(139,92,246,.5); }
```

#### Botão de Link (`.url-link-btn`)
```css
.url-link-btn {
  width: 36px; height: 36px;
  border-radius: 50%;
  border: 1px solid rgba(139,92,246,.3);
  background: rgba(139,92,246,.1);
  color: #a78bfa;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all .15s;
}
.url-link-btn:hover {
  background: rgba(139,92,246,.2);
  border-color: #a78bfa;
}
```

#### Item de link exibido (`.url-display-item`)
```css
.url-display-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 14px;
  background: rgba(139,92,246,.08);
  border: 1px solid rgba(139,92,246,.25);
  border-radius: 20px;
  font-size: 12px;
}
.url-display-item a { color: #a78bfa; text-decoration: none; flex: 1; }
```

---

## Botões — Regras de Cor

### Verde (`--success` / `.action-btn.approve`) — EXCLUSIVO para:
- **Salvar** (salvar projeto, salvar agendamento, salvar template, etc.)
- **Aprovar** (aprovar agendamento, marcar como pago)
- **WhatsApp** (`.action-btn.whats` com `#25D366`)

### Vermelho (`--danger` / `.action-btn.reject` / `.action-btn.danger`) — EXCLUSIVO para:
- **Excluir** (lixeira, remover item)
- **Cancelar / Rejeitar** (rejeitar agendamento)

### Azul lua `#8b9cf7` (`.action-btn.view`) — PADRÃO para todo o resto:
- **Criar** (+ Novo projeto, + Novo agendamento, + Novo post, etc.)
- **Ações gerais** (Ver, Editar, Galeria, Tirar foto, Upload, Baixar CSV, etc.)
- **Adicionar** (+ custos, + links, + bloquear data)
- **Configurar** (editar regras, alterar senha, criar usuário)

### Cores CSS
```css
/* Azul padrão (lua / moon) */
.action-btn.view {
  background: rgba(139,156,247,.15);
  border-color: rgba(139,156,247,.4);
  color: #8b9cf7;
}
.action-btn.view:hover {
  background: rgba(139,156,247,.25);
  border-color: #8b9cf7;
}
```

---

### Ícone SVG de link (corrente)
```html
<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="2">
  <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
  <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
</svg>
```
