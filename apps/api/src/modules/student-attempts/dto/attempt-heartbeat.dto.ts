import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class AttemptHeartbeatDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  tabSwitchCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  fullscreenExitCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  copyPasteCount?: number;

  @IsOptional()
  @IsBoolean()
  devToolsOpen?: boolean;

  @IsOptional()
  @IsBoolean()
  multipleFaceDetected?: boolean;
}
