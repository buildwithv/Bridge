import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { CreateConversationDto } from './dto/create-conversation.dto';

@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Post()
  create(
    @Query('userId', ParseUUIDPipe) userId: string,
    @Body() dto: CreateConversationDto,
  ) {
    return this.conversationsService.create(userId, dto.title);
  }

  @Get()
  findAll(@Query('userId', ParseUUIDPipe) userId: string) {
    return this.conversationsService.findAll(userId);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.conversationsService.findOne(id, userId);
  }
}
