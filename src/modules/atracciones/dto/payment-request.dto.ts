import { IsString, IsNotEmpty, IsEnum } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export enum PaymentMethod {
  CREDIT_CARD = "CREDIT_CARD",
  PAYPAL = "PAYPAL",
}

export class PaymentRequestDto {
  @ApiProperty({ description: "Token de la tarjeta (ej: tok_visa)" })
  @IsString()
  @IsNotEmpty()
  card_token: string;

  @ApiProperty({ enum: PaymentMethod, description: "Método de pago" })
  @IsEnum(PaymentMethod)
  @IsNotEmpty()
  method: PaymentMethod;
}
