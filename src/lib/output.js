import chalk from 'chalk';

export function formatJson(data) {
  return JSON.stringify(data, null, 2);
}

export function success(msg) {
  console.log(chalk.green('✓'), msg);
}

export function error(msg) {
  console.error(chalk.red('✗'), msg);
}

export function warn(msg) {
  console.log(chalk.yellow('!'), msg);
}

export function info(msg) {
  console.log(chalk.blue('→'), msg);
}

export function dim(msg) {
  console.log(chalk.dim(msg));
}

export function heading(msg) {
  console.log(chalk.bold(msg));
}

export function table(rows, headers) {
  if (headers) {
    console.log(chalk.dim(headers.join('\t')));
  }
  rows.forEach(row => {
    console.log(row.join('\t'));
  });
}

export function shortId(id) {
  return id ? id.substring(0, 8) : null;
}

export function contextItem(item, showId = true) {
  const typeColors = {
    constraint: chalk.red,
    decision: chalk.yellow,
    note: chalk.blue,
    task: chalk.magenta,
    entity: chalk.cyan
  };

  const colorFn = typeColors[item.type] || chalk.white;
  const idStr = showId && item.id ? chalk.dim(`${shortId(item.id)} `) : '';
  const prefix = colorFn(`[${item.type}]`);
  const tags = item.tags?.length ? chalk.dim(` (${item.tags.join(', ')})`) : '';

  console.log(`${idStr}${prefix} ${item.content}${tags}`);
  if (item.scope && item.scope !== '*') {
    console.log(chalk.dim(`  scope: ${item.scope}`));
  }
}
