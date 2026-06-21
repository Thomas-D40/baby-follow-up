package com.suivibaby.controller;

import com.suivibaby.entity.AppUser;
import com.suivibaby.model.CreateStoolRequest;
import com.suivibaby.model.StoolPage;
import com.suivibaby.model.StoolResponse;
import com.suivibaby.model.UpdateStoolRequest;
import com.suivibaby.security.CurrentUser;
import com.suivibaby.service.StoolService;
import io.quarkus.security.Authenticated;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.UUID;

/**
 * CRUD des selles d'un bébé (US5.1, D5-B). Routes imbriquées sous {@code babyId} — jamais d'id
 * d'événement nu. Toute opération est bornée par l'appartenance au bébé via le service : ressource
 * non liée / événement d'un autre bébé → <strong>404</strong> (D5-C) ; pas de session → 401. Pas de
 * clé d'idempotence (D5-G) : la création renvoie toujours 201. {@code PATCH} livré côté API mais non
 * câblé en UI v1 (D5-J).
 */
@Path("/api/babies/{babyId}/stools")
@Authenticated
public class StoolController {

    @Inject
    CurrentUser currentUserResolver;

    @Inject
    StoolService stoolService;

    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public Response create(@PathParam("babyId") UUID babyId, CreateStoolRequest request) {
        AppUser currentUser = currentUserResolver.require();
        StoolResponse created = stoolService.create(currentUser.id, babyId,
                request == null ? new CreateStoolRequest(null, null) : request);
        return Response.status(Response.Status.CREATED).entity(created).build();
    }

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    public StoolPage list(@PathParam("babyId") UUID babyId,
                          @QueryParam("limit") @DefaultValue("20") int limit,
                          @QueryParam("before") String before) {
        AppUser currentUser = currentUserResolver.require();
        return stoolService.list(currentUser.id, babyId, limit, before);
    }

    @PATCH
    @Path("/{id}")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public StoolResponse update(@PathParam("babyId") UUID babyId, @PathParam("id") UUID id,
                                UpdateStoolRequest request) {
        AppUser currentUser = currentUserResolver.require();
        return stoolService.update(currentUser.id, babyId, id, request);
    }

    @DELETE
    @Path("/{id}")
    public Response delete(@PathParam("babyId") UUID babyId, @PathParam("id") UUID id) {
        AppUser currentUser = currentUserResolver.require();
        stoolService.delete(currentUser.id, babyId, id);
        return Response.noContent().build();
    }
}
