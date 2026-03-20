import { IsString, Matches } from 'class-validator';
import {
  PASSWORD_POLICY_MESSAGE,
  PASSWORD_POLICY_REGEX
} from '../../../common/constants/password-policy';

export class ResetPasswordDto {
  @IsString()
  token!: string;

  @IsString()
  @Matches(PASSWORD_POLICY_REGEX, {
    message: PASSWORD_POLICY_MESSAGE
  })
  password!: string;
}
