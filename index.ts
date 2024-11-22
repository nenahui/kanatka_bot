import { PrismaClient, type SpecialResponse, type Word } from '@prisma/client';
import { configDotenv } from 'dotenv';
import { Bot, type Context, GrammyError, HttpError } from 'grammy';
import { COMMANDS } from './constants';

configDotenv();

const bot = new Bot(process.env.TOKEN as string);
const prisma = new PrismaClient();
const superUser = process.env.SUPER_ADMIN_ID as string;

const userStates: Record<number, string> = {};

interface States {
  WAITING_FOR_NEW_NAME: 'waiting_for_new_name';
  WAITING_FOR_NEW_WORD: 'waiting_for_new_word';
  WAITING_FOR_DELETE_WORD: 'waiting_for_delete_word';
  WAITING_FOR_NEW_OBSIRALKA: 'waiting_for_new_obsiralka';
  WAITING_FOR_ADD_WORD_TO_OBSIRALKA: 'waiting_for_add_word_to_obsiralka';
  WAITING_FOR_NEW_WORD_OBSIRALKA: 'waiting_for_new_word_obsiralka';
  OBSIRALKA_ID: number | null;
  OBSIRALKI: SpecialResponse[];
}

const STATES: States = {
  WAITING_FOR_NEW_NAME: 'waiting_for_new_name',
  WAITING_FOR_NEW_WORD: 'waiting_for_new_word',
  WAITING_FOR_DELETE_WORD: 'waiting_for_delete_word',
  WAITING_FOR_NEW_OBSIRALKA: 'waiting_for_new_obsiralka',
  WAITING_FOR_ADD_WORD_TO_OBSIRALKA: 'waiting_for_add_word_to_obsiralka',
  WAITING_FOR_NEW_WORD_OBSIRALKA: 'waiting_for_new_word_obsiralka',
  OBSIRALKA_ID: null,
  OBSIRALKI: [],
};

const ROLE = {
  MODERATOR: 'moderator',
  USER: 'user',
};

const getObsiralki = async () => {
  const obsiralki = await prisma.specialResponse.findMany();
  STATES.OBSIRALKI = obsiralki;
  return obsiralki;
};

const handleError = (ctx: Context, message: string) => ctx.reply(message);

const getUser = async (userTgId: number) => {
  return prisma.user.findFirst({ where: { userTgId } });
};

const addWord = async (userTgId: number, word: string) => {
  await prisma.word.create({ data: { word, author: { connect: { userTgId } } } });
};

const updateUserName = async (userTgId: number, newName: string) => {
  await prisma.user.update({
    where: { userTgId },
    data: { fullName: newName },
  });
};

bot.command('start', async (ctx) => {
  const userTgId = ctx.from?.id;
  const fullName = `${ctx.from?.first_name || ''} ${ctx.from?.last_name || ''}`.trim();
  const username = ctx.from?.username;

  if (!userTgId || !username) {
    return handleError(
      ctx,
      'Произошла ошибка при получении данных о пользователе!\nВозможно у вас неуказан юзернейм в профиле.',
    );
  }

  const isUserExist = await getUser(userTgId);

  if (isUserExist) {
    return ctx.reply(`С возвращением ${isUserExist.fullName}👏\nДобавь меня в группу и веселись🎉`);
  }

  const user = await prisma.user.create({
    data: { userTgId, fullName, username },
  });

  return ctx.reply(`Салам! ${user.fullName}👏\nДобавь меня в группу и веселись🎉`);
});

bot.hears('!изменить имя', async (ctx) => {
  const userTgId = ctx.from?.id;
  if (!userTgId) return handleError(ctx, 'Произошла ошибка при получении данных о пользователе!');

  userStates[userTgId] = STATES.WAITING_FOR_NEW_NAME;
  await ctx.reply('Введите новое имя:');
});

bot.hears('!добавить слово', async (ctx) => {
  const userTgId = ctx.from?.id;
  if (!userTgId) return handleError(ctx, 'Произошла ошибка при получении данных о пользователе!');

  const user = await getUser(userTgId);

  if (user?.role === ROLE.USER) {
    return ctx.reply('У вас нет прав для добавления новых слов.');
  }

  userStates[userTgId] = STATES.WAITING_FOR_NEW_WORD;
  await ctx.reply('Введите слово:');
});

bot.hears('!команды', async (ctx) => {
  const userTgId = ctx.from?.id;
  if (!userTgId) return handleError(ctx, 'Произошла ошибка при получении данных о пользователе!');

  const user = await getUser(userTgId);

  if (user?.role === ROLE.USER) {
    return ctx.reply('У вас нет прав для просмотра списка команд.');
  }

  let response: string = '<b>Мои команды для особо одаренных 🤪:\n\n</b>';

  COMMANDS.forEach((command) => {
    response += `<code>${command.name}</code>: ${command.description}\n\n`;
  });

  await ctx.reply(`<blockquote>${response}</blockquote>`, { parse_mode: 'HTML' });
});

bot.hears('!список слов', async (ctx) => {
  const userTgId = ctx.from?.id;
  if (!userTgId) return handleError(ctx, 'Произошла ошибка при получении данных о пользователе!');

  const user = await getUser(userTgId);

  if (user?.role === ROLE.USER) {
    return ctx.reply('У вас нет прав для просмотра списка.');
  }

  const words = await prisma.word.findMany();
  const response = words
    .map((word) => {
      return `<b>${word.id}.</b> ${word.word}`;
    })
    .join('\n\n');

  await ctx.reply(`<blockquote><b>Список всех слов:</b>\n\n${response}</blockquote>`, { parse_mode: 'HTML' });
});

bot.hears('!удалить слово', async (ctx) => {
  const userTgId = ctx.from?.id;
  if (!userTgId) return handleError(ctx, 'Произошла ошибка при получении данных о пользователе!');

  const user = await getUser(userTgId);

  if (user?.role === ROLE.USER) {
    return ctx.reply('У вас нет прав для добавления новых слов.');
  }

  userStates[userTgId] = STATES.WAITING_FOR_DELETE_WORD;
  await ctx.reply('Введите номер слова, которое хотите удалить:');
});

bot.hears('!добавить обсиралку', async (ctx) => {
  const userTgId = ctx.from?.id;
  if (!userTgId) return handleError(ctx, 'Произошла ошибка при получении данных о пользователе!');

  const user = await getUser(userTgId);

  if (user?.role === ROLE.USER) {
    return ctx.reply('У вас нет прав для добавления обсиралки.');
  }

  await getObsiralki();

  userStates[userTgId] = STATES.WAITING_FOR_NEW_OBSIRALKA;
  await ctx.reply('Введите слово на отклик:');
});

bot.hears('!добавить слово в обсиралку', async (ctx) => {
  const userTgId = ctx.from?.id;
  if (!userTgId) return handleError(ctx, 'Произошла ошибка при получении данных о пользователе!');

  const user = await getUser(userTgId);

  if (user?.role === ROLE.USER) {
    return ctx.reply('У вас нет прав для добавления слов в обсиралку.');
  }

  await getObsiralki();

  userStates[userTgId] = STATES.WAITING_FOR_ADD_WORD_TO_OBSIRALKA;
  await ctx.reply('Введите айди обсиралки, к которой хотите добавить слово:');
});

bot.hears('!список обсиралок', async (ctx) => {
  const userTgId = ctx.from?.id;
  if (!userTgId) return handleError(ctx, 'Произошла ошибка при получении данных о пользователе!');

  const user = await getUser(userTgId);

  if (user?.role === ROLE.USER) {
    return ctx.reply('У вас нет прав для добавления слов в обсиралку.');
  }

  await getObsiralki();
  const response = STATES.OBSIRALKI.map((obsiralka) => {
    return `<b>${obsiralka.id}.</b> ${obsiralka.trigger}\n<b>Слова:</b>\n${obsiralka.words.join(', ')}`;
  }).join('\n\n');

  await ctx.reply(`<blockquote><b>Список всех обсиралок:</b>\n\n${response}</blockquote>`, { parse_mode: 'HTML' });
});

bot.on('message', async (ctx) => {
  const userTgId = ctx.from?.id;
  const message = ctx.message?.text;
  const repliedToMessage = ctx.message?.reply_to_message;

  if (!userTgId || !message) {
    return;
  }

  const matchedObsiralka = await prisma.specialResponse.findFirst({
    where: { trigger: message },
  });

  if (matchedObsiralka) {
    const words = matchedObsiralka.words;
    if (words.length > 0) {
      const randomWord = words[Math.floor(Math.random() * words.length)];
      await ctx.reply(randomWord, { reply_to_message_id: ctx.message.message_id });
    } else {
      await ctx.reply('Для этой обсиралки пока нет слов.', { reply_to_message_id: ctx.message.message_id });
    }
    return;
  }

  if ((message === '!повысить' || message === '!понизить') && repliedToMessage) {
    if (String(userTgId) === superUser) {
      const targetUserId = repliedToMessage.from?.id;

      if (!targetUserId) return handleError(ctx, 'Не удалось определить пользователя для повышения.');

      const targetUser = await getUser(targetUserId);

      if (!targetUser) return handleError(ctx, 'Этот пользователь не зарегистрирован у меня.');

      if (message === '!повысить' && targetUser.role === ROLE.MODERATOR) {
        return handleError(ctx, 'Этот пользователь уже имеет роль модератора.');
      }

      if (message === '!понизить' && targetUser.role === ROLE.USER) {
        return handleError(ctx, 'Этот пользователь уже имеет роль пользователя.');
      }

      if (message === '!повысить') {
        await prisma.user.update({
          where: { userTgId: targetUserId },
          data: { role: ROLE.MODERATOR },
        });
        return ctx.reply(`Пользователь ${targetUser.fullName} успешно повышен до модератора.`);
      } else {
        await prisma.user.update({
          where: { userTgId: targetUserId },
          data: { role: ROLE.USER },
        });
        return ctx.reply(`Пользователь ${targetUser.fullName} успешно понижен до дебила.`);
      }
    } else {
      return handleError(ctx, 'Чепушила, ты не достоин этой команды!');
    }
  }

  if (userStates[userTgId] === STATES.WAITING_FOR_ADD_WORD_TO_OBSIRALKA) {
    const obsiralkaId = parseInt(message);
    if (isNaN(obsiralkaId)) {
      userStates[userTgId] = '';
      return ctx.reply('Айди обсиралки должно быть числом.');
    }

    const obsiralka = STATES.OBSIRALKI.find((item) => item.id === obsiralkaId);
    if (!obsiralka) {
      return ctx.reply(`Обсиралка с айди ${obsiralkaId} не найдена.`);
    }

    userStates[userTgId] = `${STATES.WAITING_FOR_NEW_WORD_OBSIRALKA}/${obsiralkaId}`;

    await ctx.reply('Введите слово, которое хотите добавить в обсиралку:');
    return;
  }

  if (userStates[userTgId]?.startsWith(STATES.WAITING_FOR_NEW_WORD_OBSIRALKA)) {
    const [_, obsiralkaId] = userStates[userTgId].split('/');
    const obsiralka = STATES.OBSIRALKI.find((item) => item.id === parseInt(obsiralkaId));

    if (!obsiralka) {
      userStates[userTgId] = '';
      return handleError(ctx, 'Обсиралка не найдена.');
    }

    const word = message.trim();
    await prisma.specialResponse.update({
      where: { id: obsiralka.id },
      data: {
        words: {
          push: word,
        },
      },
    });

    userStates[userTgId] = '';
    return ctx.reply(`Слово "${word}" успешно добавлено к обсиралке.`);
  }

  if (userStates[userTgId] === STATES.WAITING_FOR_NEW_OBSIRALKA) {
    const trigger = message;
    await prisma.specialResponse.create({ data: { trigger, words: [] } });
    userStates[userTgId] = '';
    return ctx.reply(`Обсиралка успешно добавлена: ${trigger}`);
  }

  if (userStates[userTgId] === STATES.WAITING_FOR_NEW_NAME) {
    await updateUserName(userTgId, message);
    userStates[userTgId] = '';
    return ctx.reply(`Имя успешно изменено на ${message}`);
  }

  if (userStates[userTgId] === STATES.WAITING_FOR_DELETE_WORD) {
    const wordId = parseInt(message);
    if (isNaN(wordId)) {
      return ctx.reply('Номер слова должен быть числом.');
    }
    const isExistsWord = await prisma.word.findFirst({ where: { id: wordId } });
    if (!isExistsWord) {
      return ctx.reply(`Такого слова с номером ${wordId} не существует.`);
    }
    await prisma.word.delete({ where: { id: wordId } });
    userStates[userTgId] = '';
    return ctx.reply(`Слово с номером ${wordId} успешно удалено.`);
  }

  if (userStates[userTgId] === STATES.WAITING_FOR_NEW_WORD) {
    const isExistsWord = await prisma.word.findFirst({ where: { word: message } });
    if (isExistsWord) {
      return ctx.reply('Такое слово уже существует.');
    }
    await addWord(userTgId, message);
    userStates[userTgId] = '';
    return ctx.reply(`Слово успешно добавлено: ${message}`);
  }

  if (repliedToMessage?.from?.id === ctx.me.id) {
    const randomWordResponse = (await prisma.$queryRawUnsafe(
      `SELECT * FROM "Word" ORDER BY RANDOM() LIMIT 1;`,
    )) as Word[];
    const randomWord = randomWordResponse[0];

    if (randomWord) {
      await ctx.reply(randomWord.word, { reply_to_message_id: ctx.message.message_id });
    }
    return;
  }

  if (Math.random() < 0.05) {
    const randomWordResponse = (await prisma.$queryRawUnsafe(
      `SELECT * FROM "Word" ORDER BY RANDOM() LIMIT 1;`,
    )) as Word[];
    const randomWord = randomWordResponse[0];

    if (randomWord) {
      await ctx.reply(randomWord.word, { reply_to_message_id: ctx.message.message_id });
    }
  }
});

bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`);
  const e = err.error;

  if (e instanceof GrammyError) {
    console.error('Error in request:', e.description);
  } else if (e instanceof HttpError) {
    console.error('Could not contact Telegram:', e);
  } else {
    console.error('Unknown error:', e);
  }
});

bot.start().then(() => console.log('Бот запущен!'));

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  await bot.stop();
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  await bot.stop();
});
