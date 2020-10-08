import { InputTypes, TextTypes } from "./Inputs";
import { EditActions } from "./DataActions";

export const RequiredFields = {
  email: {
    key: "email",
    title: "Email",
    placeholder: "Email",
    mutable: false,
    inputType: InputTypes.TEXT_INPUT,
    textType: TextTypes.EMAIL
  },
  password: {
    key: "password",
    title: "Password",
    placeholder: "Password",
    mutable: false,
    inputType: InputTypes.TEXT_INPUT,
    textType: TextTypes.PASSWORD,
    editAction: EditActions.CHANGE_PASSWORD
  },
  confirmPassword: {
    key: "confirmPassword",
    title: "Confirm password",
    placeholder: "Confirm password",
    mutable: false,
    inputType: InputTypes.TEXT_INPUT,
    textType: TextTypes.CONFIRM_PASSWORD
  }
}

export const RegisterFields = [
  RequiredFields.email,
  { ...RequiredFields.password, textType: TextTypes.NEW_PASSWORD },
  RequiredFields.confirmPassword
];

export const LoginFields = [
  RequiredFields.email,
  RequiredFields.password
];

export const SettingsFields = LoginFields;