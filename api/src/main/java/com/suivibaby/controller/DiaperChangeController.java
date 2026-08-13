package com.suivibaby.controller;

import com.suivibaby.entity.AppUser;
import com.suivibaby.model.CreateDiaperChangeRequest;
import com.suivibaby.model.DiaperChangeResponse;
import com.suivibaby.security.CurrentUser;
import com.suivibaby.service.DiaperChangeService;
import io.quarkus.security.Authenticated;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.UUID;

@Path("/api/babies/{babyId}/diaper-changes")
@Authenticated
public class DiaperChangeController {

    @Inject
    CurrentUser currentUserResolver;

    @Inject
    DiaperChangeService diaperChangeService;

    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public Response create(@PathParam("babyId") UUID babyId, CreateDiaperChangeRequest request) {
        AppUser currentUser = currentUserResolver.require();
        if (request == null) {
            throw new BadRequestException("Corps de requête requis.");
        }
        DiaperChangeResponse created = diaperChangeService.create(currentUser.id, babyId, request);
        return Response.status(Response.Status.CREATED).entity(created).build();
    }
}
