package com.suivibaby.controller;

import com.suivibaby.entity.AppUser;
import com.suivibaby.model.UpsertWeightRequest;
import com.suivibaby.model.WeightHistoryResponse;
import com.suivibaby.model.WeightPoint;
import com.suivibaby.security.CurrentUser;
import com.suivibaby.service.WeightService;
import io.quarkus.security.Authenticated;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.UUID;

@Path("/api/babies/{babyId}/weights")
@Authenticated
public class WeightController {

    @Inject
    CurrentUser currentUserResolver;

    @Inject
    WeightService weightService;

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    public WeightHistoryResponse history(@PathParam("babyId") UUID babyId) {
        AppUser currentUser = currentUserResolver.require();
        return weightService.history(currentUser.id, babyId);
    }

    @PUT
    @Path("/{date}")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public WeightPoint upsert(@PathParam("babyId") UUID babyId,
                             @PathParam("date") String date,
                             UpsertWeightRequest body) {
        AppUser currentUser = currentUserResolver.require();
        return weightService.upsert(currentUser.id, babyId, date, body); // 200 last-writer-wins (D12-C′)
    }

    @DELETE
    @Path("/{date}")
    public Response delete(@PathParam("babyId") UUID babyId,
                          @PathParam("date") String date) {
        AppUser currentUser = currentUserResolver.require();
        weightService.delete(currentUser.id, babyId, date);
        return Response.noContent().build(); // 204 idempotent (D12-D′)
    }
}
