import {
  Body,
  Get,
  Post,
  Route,
  Tags,
  Security,
  Request,
  Path,
  Query,
  Controller,
  Res,
  TsoaResponse,
  SuccessResponse,
} from "tsoa";
import { AppDataSource, Pins } from "./models";
import { Posts, User } from "./models";
import { uploadBase64ToObjectStorage } from "./objectstorage.service";
import type { JwtPayload } from "./utils";
import { In } from "typeorm";

export interface CreatePostBase64Input {
  imageBase64: string;
  imageFileType: string;
  caption?: string;
}

export interface PostResponse {
  id: number;
  imageUrl: string;
  caption: string | null;
  createdAt: Date;
  userId: number;
  username: string;
  avatarUrl: string | null;
  hasPinned: boolean;
}

@Route("posts")
@Tags("Posts")
export class PostController extends Controller {
  @Security("jwt")
  @Post("")
  @SuccessResponse(200, "Post Created")
  public async createPost(
    @Request() req: Express.Request,
    @Body() body: CreatePostBase64Input,
    @Res() badRequestResponse: TsoaResponse<400, { message: string }>,
    @Res() serverErrorResponse: TsoaResponse<500, { message: string }>
  ): Promise<PostResponse> {
    const currentUser = req.user as JwtPayload;

    if (!body.imageBase64 || !body.imageFileType.startsWith("image/")) {
      return badRequestResponse(400, {
        message: "imageBase64 and a valid imageFileType are required.",
      });
    }

    let base64Data = body.imageBase64;
    const prefixMatch = body.imageBase64.match(/^data:(image\/\w+);base64,/);
    if (prefixMatch) {
      base64Data = body.imageBase64.substring(prefixMatch[0].length);
    }

    try {
      const uploadResult = await uploadBase64ToObjectStorage(
        base64Data,
        body.imageFileType
      );

      const postRepo = AppDataSource.getRepository(Posts);
      const newPost = postRepo.create({
        userId: currentUser.userId,
        imageUrl: uploadResult.objectUrl,
        caption: body.caption || null,
      });
      const savedPost = await postRepo.save(newPost);

      const user = await AppDataSource.getRepository(User).findOneBy({
        id: currentUser.userId,
      });

      this.setStatus(200);
      return {
        ...savedPost,
        username: user?.username || "unknown",
        avatarUrl: user?.avatarUrl || null,
        hasPinned: false, // Default value, can be updated later
      };
    } catch (error: any) {
      console.error("Post creation failed:", error);
      return serverErrorResponse(500, {
        message: error.message || "Failed to create post.",
      });
    }
  }

  @Security("jwt", ["optional"])
  @Get("")
  public async getFeedPosts(
    @Request() req: Express.Request,
    @Query() limit: number = 10,
    @Query() offset: number = 0
  ): Promise<PostResponse[]> {
    const posts = await AppDataSource.getRepository(Posts).find({
      relations: ["user"],
      order: { createdAt: "DESC" },
      take: limit,
      skip: offset,
    });

    const currentUser = req.user as JwtPayload;
    const pins =
      currentUser && currentUser.userId
        ? await AppDataSource.getRepository(Pins).find({
            where: {
              userId: currentUser.userId,
              postId: In(posts.map((p) => p.id)),
            },
          })
        : null;

    return posts.map((post) => ({
      id: post.id,
      imageUrl: post.imageUrl,
      caption: post.caption,
      createdAt: post.createdAt,
      userId: post.userId,
      username: post.user?.username || "unknown",
      avatarUrl: post.user?.avatarUrl || null,
      hasPinned: pins ? pins.some((pin) => pin.postId === post.id) : false,
    }));
  }

  @Security("jwt", ["optional"])
  @Get("search")
  public async searchPosts(
    @Request() req: Express.Request,
    @Query() query: string,
    @Query() limit: number = 10,
    @Query() offset: number = 0,
    @Res() badRequestResponse: TsoaResponse<400, { message: string }>
  ): Promise<PostResponse[]> {
    if (!query.trim()) {
      return badRequestResponse(400, {
        message: "Search query cannot be empty",
      });
    }
    const searchTerm = query.trim().split(/\s+/).join(" & ");

    const posts = await AppDataSource.getRepository(Posts)
      .createQueryBuilder("posts")
      .leftJoinAndSelect("posts.user", "user")
      .where("to_tsvector(posts.caption) @@ plainto_tsquery(:query)", {
        query: searchTerm,
      })
      .orderBy("posts.createdAt", "DESC")
      .take(limit)
      .skip(offset)
      .getMany();

    const currentUser = req.user as JwtPayload;
    const pins =
      currentUser && currentUser.userId
        ? await AppDataSource.getRepository(Pins).find({
            where: {
              userId: currentUser.userId,
              postId: In(posts.map((p) => p.id)),
            },
          })
        : [];

    return posts.map((post) => ({
      id: post.id,
      imageUrl: post.imageUrl,
      caption: post.caption,
      createdAt: post.createdAt,
      userId: post.userId,
      username: post.user?.username || "unknown",
      avatarUrl: post.user?.avatarUrl || null,
      hasPinned: pins.some((pin) => pin.postId === post.id),
    }));
  }

  @Security("jwt", ["optional"])
  @Get("{postId}")
  public async getPostById(
    @Request() req: Express.Request,
    @Path() postId: number,
    @Res() notFoundResponse: TsoaResponse<404, { message: string }>
  ): Promise<PostResponse> {
    const post = await AppDataSource.getRepository(Posts).findOne({
      where: { id: postId },
      relations: ["user"],
    });

    if (!post) {
      return notFoundResponse(404, { message: "Post not found" });
    }

    const currentUser = req.user as JwtPayload;
    const pins =
      currentUser && currentUser.userId
        ? await AppDataSource.getRepository(Pins).findOne({
            where: {
              userId: currentUser.userId,
              postId: post.id,
            },
          })
        : null;

    return {
      id: post.id,
      imageUrl: post.imageUrl,
      caption: post.caption,
      createdAt: post.createdAt,
      userId: post.userId,
      username: post.user?.username || "unknown",
      avatarUrl: post.user?.avatarUrl || null,
      hasPinned: pins ? true : false,
    };
  }
}
