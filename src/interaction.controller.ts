import {
  Post,
  Delete,
  Route,
  Tags,
  Security,
  Request,
  Path,
  Body,
  Controller,
  Res,
  TsoaResponse,
  SuccessResponse,
  Get,
  Query,
} from "tsoa";
import { AppDataSource, Pins, Comment, Posts, User } from "./models";
import type { JwtPayload } from "./utils";

export interface CreateCommentInput {
  text: string;
}

export interface CommentResponse {
  id: number;
  text: string;
  userId: number;
  postId: number;
  username: string;
  avatarUrl: string | null;
  createdAt: Date;
}

@Route("posts/{postId}")
@Tags("Interactions (Pin & Comments)")
export class InteractionController extends Controller {
  @Security("jwt")
  @SuccessResponse(201, "Liked")
  @Post("pin")
  public async pinPost(
    @Request() req: Express.Request,
    @Path() postId: number,
    @Res() notFoundResponse: TsoaResponse<404, { message: string }>
  ): Promise<{ message: string }> {
    const currentUser = req.user as JwtPayload;

    const post = await AppDataSource.getRepository(Posts).findOneBy({
      id: postId,
    });
    if (!post) return notFoundResponse(404, { message: "Post not found." });

    const user = await AppDataSource.getRepository(User).findOneBy({
      id: currentUser.userId,
    });
    if (!user) throw new Error("User not found");

    const like = Pins.create({ post, user, postId, userId: user.id });
    await like.save();

    return { message: "Post pinned successfully" };
  }

  @Security("jwt")
  @SuccessResponse(200, "Unpinned")
  @Delete("unpin")
  public async unpinPost(
    @Request() req: Express.Request,
    @Path() postId: number
  ): Promise<{ message: string }> {
    const currentUser = req.user as JwtPayload;

    await AppDataSource.getRepository(Pins).delete({
      postId,
      userId: currentUser.userId,
    });

    return { message: "Post unpinned successfully" };
  }

  @Security("jwt")
  @SuccessResponse(201, "Comment Created")
  @Post("comments")
  public async createComment(
    @Request() req: Express.Request,
    @Path() postId: number,
    @Body() body: CreateCommentInput,
    @Res() notFoundResponse: TsoaResponse<404, { message: string }>
  ): Promise<CommentResponse> {
    const currentUser = req.user as JwtPayload;

    const post = await AppDataSource.getRepository(Posts).findOneBy({
      id: postId,
    });
    if (!post) return notFoundResponse(404, { message: "Post not found." });

    const user = await AppDataSource.getRepository(User).findOneBy({
      id: currentUser.userId,
    });
    if (!user) throw new Error("User not found");

    const comment = Comment.create({
      post,
      user,
      postId,
      userId: user.id,
      content: body.text,
    });
    const saved = await comment.save();

    return {
      id: saved.id,
      text: saved.content,
      userId: saved.userId,
      postId: saved.postId,
      username: user.username,
      avatarUrl: user.avatarUrl,
      createdAt: saved.createdAt,
    };
  }

  @Get("comments")
  public async getComments(
    @Path() postId: number,
    @Query() limit: number = 10,
    @Query() offset: number = 0,
    @Res() notFoundResponse: TsoaResponse<404, { message: string }>
  ): Promise<CommentResponse[]> {
    const post = await AppDataSource.getRepository(Posts).findOneBy({
      id: postId,
    });
    if (!post) return notFoundResponse(404, { message: "Post not found." });

    const comments = await AppDataSource.getRepository(Comment).find({
      where: { postId },
      relations: ["user"],
      order: { createdAt: "DESC" },
      take: limit,
      skip: offset,
    });

    return comments
      .filter(
        (c) => c.postId === postId && c.userId !== null && c.user !== null
      )
      .map((c) => ({
        id: c.id,
        text: c.content,
        userId: c.userId,
        postId: c.postId,
        username: c.user?.username || "unknown",
        avatarUrl: c.user?.avatarUrl || null,
        createdAt: c.createdAt,
      }));
  }
}
