import inquirer from "inquirer";

import { hashAdminPassword } from "../src/lib/admin-password.ts";

const { password, confirmation } = await inquirer.prompt([
  {
    type: "password",
    name: "password",
    message: "Nueva contraseña local de administración",
    mask: "*",
    validate: (value) => value.length >= 12 || "Usa al menos 12 caracteres",
  },
  {
    type: "password",
    name: "confirmation",
    message: "Confirma la nueva contraseña",
    mask: "*",
  },
]);

if (password.length < 12) {
  console.error("Usa al menos 12 caracteres para la contraseña de administración");
  process.exitCode = 1;
} else if (password !== confirmation) {
  console.error("Las contraseñas no coinciden");
  process.exitCode = 1;
} else {
  console.log(`ADMIN_PASSWORD_HASH=${await hashAdminPassword(password)}`);
}
