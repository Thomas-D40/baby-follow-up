package com.suivibaby.controller;

import com.suivibaby.entity.AppUser;
import com.suivibaby.model.BottleFeedingPage;
import com.suivibaby.model.BottleFeedingResponse;
import com.suivibaby.model.CreateBottleFeedingRequest;
import com.suivibaby.model.UpdateBottleFeedingRequest;
import com.suivibaby.security.CurrentUser;
import com.suivibaby.service.BottleFeedingService;
import io.quarkus.security.Authenticated;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.UUID;

/**
 * CRUD des biberons d'un bébé (US3.1, D3-B). Routes imbriquées sous {@code babyId} — jamais d'id
 * d'événement nu (D3-B). Toute opération est bornée par l'appartenance au bébé via le service :
 * ressource non liée / événement d'un autre bébé → <strong>404</strong> (D3-C) ; pas de session → 401.
 * Pas de clé d'idempotence (D3-A) : la création renvoie toujours 201.
 */
@Path("/api/babies/{babyId}/bottle-feedings")
@Authenticated
public class BottleFeedingController {

    @Inject
    CurrentUser currentUserResolver;

    @Inject
    BottleFeedingService bottleFeedingService;

    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public Response create(@PathParam("babyId") UUID babyId, CreateBottleFeedingRequest request) {
        AppUser currentUser = currentUserResolver.require();
        BottleFeedingResponse created = bottleFeedingService.create(currentUser.id, babyId, request);
        return Response.status(Response.Status.CREATED).entity(created).build();
    }

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    public BottleFeedingPage list(@PathParam("babyId") UUID babyId,
                                  @QueryParam("limit") @DefaultValue("20") int limit,
                                  @QueryParam("before") String before) {
        AppUser currentUser = currentUserResolver.require();
        return bottleFeedingService.list(currentUser.id, babyId, limit, before);
    }

    @PATCH
    @Path("/{id}")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public BottleFeedingResponse update(@PathParam("babyId") UUID babyId, @PathParam("id") UUID id,
                                        UpdateBottleFeedingRequest request) {
        AppUser currentUser = currentUserResolver.require();
        return bottleFeedingService.update(currentUser.id, babyId, id, request);
    }

    @DELETE
    @Path("/{id}")
    public Response delete(@PathParam("babyId") UUID babyId, @PathParam("id") UUID id) {
        AppUser currentUser = currentUserResolver.require();
        bottleFeedingService.delete(currentUser.id, babyId, id);
        return Response.noContent().build();
    }
}
