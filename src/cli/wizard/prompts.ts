import Enquirer from "enquirer";

const enquirer = new Enquirer();

export async function askText(
  message: string,
  initial?: string,
): Promise<string> {
  const response = await enquirer.prompt<{ value: string }>({
    type: "input",
    name: "value",
    message,
    initial,
  });
  return response.value;
}

export async function askPassword(message: string): Promise<string> {
  const response = await enquirer.prompt<{ value: string }>({
    type: "password",
    name: "value",
    message,
  });
  return response.value;
}

export async function askConfirm(
  message: string,
  initial?: boolean,
): Promise<boolean> {
  const response = await enquirer.prompt<{ value: boolean }>({
    type: "confirm",
    name: "value",
    message,
    initial: initial ?? true,
  });
  return response.value;
}

export async function askSelect(
  message: string,
  choices: Array<{ name: string; value: string }>,
): Promise<string> {
  const response = await enquirer.prompt<{ value: string }>({
    type: "select",
    name: "value",
    message,
    choices: choices.map((c) => ({ name: c.value, message: c.name })),
  });
  return response.value;
}
