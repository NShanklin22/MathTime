// Account chores on mainframe, inside the container (deploy/README.md):
//
//   docker compose exec api node cli.mjs invite         a new invite code, for one sign-up within 14 days
//   docker compose exec api node cli.mjs reset <name>   a one-time code that sets a new password for <name>
//   docker compose exec api node cli.mjs users          every account's name
//
// Env DB_PATH, as for the server.
import { openDb, createCode, findUser, listUsers } from './store.mjs';

export function run(db, args, now = Date.now()) {
  const [command, name] = args;
  switch (command) {
    case 'invite':
      return { out: createCode(db, { now }) };
    case 'reset': {
      if (!name) return { err: 'Usage: node cli.mjs reset <name>', code: 2 };
      const user = findUser(db, name);
      if (!user) return { err: `No account named ${name}. See: node cli.mjs users`, code: 1 };
      const code = createCode(db, { userId: user.id, now });
      return {
        out: `${code}\nSign up with this code and the name ${user.name} to set a new password ` +
          '(once, within 14 days). It logs ' + user.name + ' out everywhere.',
      };
    }
    case 'users':
      return { out: listUsers(db).map((u) => u.name).join('\n') || '(no accounts yet)' };
    default:
      return { err: 'Usage: node cli.mjs invite | reset <name> | users', code: 2 };
  }
}

if (import.meta.main) {
  const db = openDb(process.env.DB_PATH || 'data/mathtime.db');
  const { out, err, code = 0 } = run(db, process.argv.slice(2));
  db.close();
  if (out) console.log(out);
  if (err) console.error(err);
  process.exitCode = code;
}
