# LLM Council - Монорепозиторий

Проект организован как монорепозиторий с использованием npm workspaces.

## Структура

```
llm-council/
├── packages/
│   └── shared/          # Общие типы и интерфейсы для фронта и бэка
├── backend-ts/          # TypeScript backend (Fastify)
├── frontend/            # React frontend
├── tsconfig.base.json   # Базовый TypeScript конфиг
├── eslint.config.js     # Общий ESLint конфиг
└── package.json        # Root package с workspaces
```

## Установка

```bash
# Установить все зависимости (включая workspaces)
npm install

# Собрать shared пакет (необходимо перед использованием)
npm run build:shared
```

## Разработка

```bash
# Запустить backend и frontend одновременно
npm run dev

# Или отдельно:
npm run backend:dev
npm run frontend:dev
```

## Сборка

```bash
# Собрать все пакеты
npm run build

# Или отдельно:
npm run build:shared
npm run build:backend
npm run build:frontend
```

## Линтинг и проверка типов

```bash
# Линтинг всех пакетов
npm run lint

# Проверка типов всех пакетов
npm run type-check
```

## Использование shared типов

### В backend-ts:

```typescript
import type { Conversation, Message, Stage1Result } from '@llm-council/shared';
```

### В frontend:

```typescript
import type { Conversation, Message, Stage1Result } from '@llm-council/shared';
```

## Правила типизации

Все правила типизации унифицированы через:
- `tsconfig.base.json` - базовые настройки TypeScript
- `eslint.config.js` - единые правила линтинга
- `packages/shared/` - общие типы для консистентности

### Основные правила:
- `strict: true` - строгая типизация
- `noUnusedLocals: true` - неиспользуемые переменные
- `noUnusedParameters: true` - неиспользуемые параметры
- `noImplicitReturns: true` - явные возвраты
- `noFallthroughCasesInSwitch: true` - полные switch
- `noUncheckedIndexedAccess: true` - безопасный доступ к индексам
- `exactOptionalPropertyTypes: true` - точные опциональные типы

## Workspaces

Проект использует npm workspaces для управления зависимостями:
- Все зависимости устанавливаются в корне
- Workspaces могут ссылаться друг на друга через `@llm-council/shared`
- Общие devDependencies вынесены в root package.json
